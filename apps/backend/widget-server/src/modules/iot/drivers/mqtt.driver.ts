import { Logger } from '@nestjs/common';
import mqtt, { type ISubscriptionMap, type MqttClient } from 'mqtt';
import type { DeviceSubscription, DriverContext, ProtocolDriver } from './driver';
import { parseTelemetryPayload, topicToRegExp } from './driver';

export interface MqttBrokerOptions {
  /** mqtt://host:port 或 mqtts://（TLS） */
  url: string;
  clientIdPrefix: string;
  username?: string;
  password?: string;
}

/**
 * MQTT 协议驱动：一个驱动实例对应一个 Broker 连接，可承载多个设备订阅。
 * - QoS 默认 1（设备 connectionConfig.qos 可覆盖）；
 * - mqtt.js 自带指数退避重连，重连后自动恢复订阅；
 * - 主题支持 +/# 通配符，报文主题按订阅模式匹配后归属到设备。
 */
export class MqttDriver implements ProtocolDriver {
  readonly protocol = 'MQTT';
  private readonly logger = new Logger(MqttDriver.name);
  private client: MqttClient | null = null;
  private subscriptions: DeviceSubscription[] = [];
  /** 订阅主题 → 匹配器缓存 */
  private matchers = new Map<DeviceSubscription, RegExp>();

  constructor(
    private readonly broker: MqttBrokerOptions,
    private readonly context: DriverContext,
  ) {}

  async start(subscriptions: DeviceSubscription[]): Promise<void> {
    if (subscriptions.length === 0) return;
    this.subscriptions = subscriptions;
    this.matchers = new Map(subscriptions.map((s) => [s, topicToRegExp(s.topic)]));

    const clientId = `${this.broker.clientIdPrefix}-${Date.now().toString(36)}`;
    await new Promise<void>((resolve, reject) => {
      this.client = mqtt.connect(this.broker.url, {
        clientId,
        username: this.broker.username || undefined,
        password: this.broker.password || undefined,
        keepalive: 30,
        reconnectPeriod: 5000,
        connectTimeout: 10_000,
        clean: true,
      });

      this.client.on('connect', () => {
        this.logger.log(`MQTT 已连接 ${this.broker.url}（clientId=${clientId}）`);
        const topics: ISubscriptionMap = {};
        this.subscriptions.forEach((s) => {
          // qos 收敛到 0/1/2（mqtt-packet 约束），订阅级降为 0/1
          topics[s.topic] = { qos: (s.qos ?? 1) >= 2 ? 2 : 1 };
        });
        this.client?.subscribe(topics, (err) => {
          if (err) {
            this.context.onError(`mqtt:subscribe:${this.broker.url}`, err);
            return;
          }
          this.logger.log(
            `已订阅 ${this.subscriptions.length} 个主题：${this.subscriptions.map((t) => t.topic).join(', ')}`,
          );
        });
        resolve();
      });
      this.client.on('reconnect', () => {
        this.context.onStatusAll?.(false);
      });
      this.client.on('close', () => {
        this.context.onStatusAll?.(false);
      });
      this.client.on('error', (err) => {
        this.context.onError(`mqtt:${this.broker.url}`, err);
      });
      this.client.on('message', (topic, payload) => this.handleMessage(topic, payload));

      this.client.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
    this.logger.log(`MQTT 连接已关闭：${this.broker.url}`);
  }

  private handleMessage(topic: string, payload: Buffer): void {
    const device = this.resolveDevice(topic);
    if (!device) return;
    const points = parseTelemetryPayload(payload);
    if (points.length === 0) return;
    this.context.onMessage(device, topic, points);
    this.context.onStatus(device, true);
  }

  /** 报文主题 → 订阅设备；通配主题（如 device/+/telemetry）匹配所有命中的订阅 */
  private resolveDevice(topic: string): DeviceSubscription | null {
    for (const [subscription, matcher] of this.matchers) {
      if (matcher.test(topic)) return subscription;
    }
    return null;
  }
}
