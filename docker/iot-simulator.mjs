#!/usr/bin/env node
/**
 * IoT 设备模拟器（Sprint 1 演示用）。
 *
 * 模拟种子数据中的 MQTT 设备（TRANS-001）周期上报遥测，驱动
 * 「MQTT → 平台接入服务 → PostgreSQL → Socket.IO 推送 → 大屏实时刷新」全链路演示。
 *
 * 用法（需先 pnpm infra:up:iot 启动 MQTT Broker；该 profile 用的是 eclipse-mosquitto:2，
 * 配置见 docker/mosquitto/mosquitto.conf，已放开匿名连接并关闭持久化）：
 *   pnpm iot:sim                     # 默认上报 TRANS-001
 *   MQTT_BROKER=mqtt://localhost:1883 pnpm iot:sim
 *
 * 报文格式为平台标准格式：
 *   { "deviceCode": "TRANS-001", "properties": { "temperature": 65.2, "load": 71.3 }, "timestamp": "..." }
 */
import mqtt from 'mqtt';

const broker = process.env.MQTT_BROKER ?? 'mqtt://localhost:1883';
const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 2000);
const devices = (process.env.SIM_DEVICES ?? 'TRANS-001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// 各设备的属性模型：基准值 + 波动幅度（含缓慢漂移与随机毛刺）
const profiles = {
  'TRANS-001': {
    temperature: { base: 65, wave: 12, spike: 0.04 },
    load: { base: 70, wave: 15, spike: 0.02 },
  },
  default: {
    temperature: { base: 40, wave: 8, spike: 0.03 },
  },
};

const client = mqtt.connect(broker, { clientId: `dt-simulator-${process.pid}` });

client.on('connect', () => {
  console.log(
    `[simulator] 已连接 ${broker}，${devices.length} 台设备，每 ${intervalMs}ms 上报一次`,
  );
  const timer = setInterval(() => devices.forEach(publish), intervalMs);
  const shutdown = () => {
    clearInterval(timer);
    client.end(true, () => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});

client.on('error', (err) => {
  console.error('[simulator] 连接失败：', err.message);
  process.exit(1);
});

function publish(deviceCode) {
  const profile = profiles[deviceCode] ?? profiles.default;
  const properties = {};
  for (const [code, p] of Object.entries(profile)) {
    // 缓慢正弦漂移 + 随机抖动 + 小概率毛刺（触发告警联调）
    const t = Date.now() / 60000;
    const drift = Math.sin(t + deviceCode.length) * p.wave * 0.6;
    const noise = (Math.random() - 0.5) * p.wave * 0.4;
    const spike = Math.random() < p.spike ? p.wave * 1.6 : 0;
    properties[code] = Number((p.base + drift + noise + spike).toFixed(2));
  }
  const payload = JSON.stringify({
    deviceCode,
    properties,
    timestamp: new Date().toISOString(),
  });
  client.publish(`device/${deviceCode}/telemetry`, payload, { qos: 1 });
}
