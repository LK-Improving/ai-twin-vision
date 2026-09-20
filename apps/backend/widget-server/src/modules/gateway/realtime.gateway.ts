import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AppConfig } from '../../config/configuration';
import {
  RealtimeClientEvent,
  RealtimeServerEvent,
  type RealtimeSubscribePayload,
} from '@dt/shared-types';

/**
 * 实时推送网关（Sprint 1）。
 *
 * - 握手鉴权：客户端 connect 时传 { auth: { token: accessToken } }，
 *   服务端用 Access Token 密钥验签；无效则断开。15 分钟过期由客户端重连时重新携带。
 * - 订阅模型：device:{deviceId} 房间收遥测/状态；scene:{sceneId} 房间收场景级事件。
 *   房间名带 tenantId 前缀做隔离，避免跨租户投递。
 * - 广播入口：RealtimeGateway 的 broadcastXxx 方法由 IotModule / 告警模块调用。
 */
@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(): void {
    this.logger.log('实时推送网关已就绪（/socket.io）');
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.emitErrorAndDisconnect(client, '缺少访问令牌');
      return;
    }
    try {
      const secret = this.config.get<AppConfig['jwt']>('jwt')!.accessSecret;
      const payload = this.jwtService.verify<{
        sub?: string;
        tenantId: string;
        username?: string;
        scope?: string;
        sceneId?: string;
      }>(token, { secret });

      // 大屏票据（/screen/:token 用发布令牌换取）：只读、限场景，无登录用户身份
      if (payload.scope === 'screen') {
        if (!payload.sceneId) {
          this.emitErrorAndDisconnect(client, '大屏票据缺少场景标识');
          return;
        }
        client.data.screen = { sceneId: payload.sceneId, tenantId: payload.tenantId };
        client.data.user = {
          userId: `screen:${payload.sceneId}`,
          tenantId: payload.tenantId,
          username: 'screen',
        };
        return;
      }

      client.data.user = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        username: payload.username,
      };
    } catch {
      this.emitErrorAndDisconnect(client, '访问令牌无效或已过期');
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`客户端断开：${client.id}`);
  }

  @SubscribeMessage(RealtimeClientEvent.SUBSCRIBE)
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RealtimeSubscribePayload,
  ): { event: string; data: { deviceIds: string[]; sceneId: string | null } } {
    const user = client.data.user as { tenantId: string } | undefined;
    const screen = client.data.screen as { sceneId: string } | undefined;
    const deviceIds = Array.isArray(payload?.deviceIds) ? payload.deviceIds.slice(0, 200) : [];
    deviceIds.forEach((id) => client.join(this.deviceRoom(user!.tenantId, id)));
    // 大屏票据只能订阅票据绑定的场景，避免拿一枚令牌窃听同租户其他场景
    const sceneId = screen ? screen.sceneId : (payload?.sceneId ?? null);
    if (sceneId) client.join(this.sceneRoom(user!.tenantId, sceneId));
    return {
      event: RealtimeServerEvent.SUBSCRIBED,
      data: { deviceIds, sceneId },
    };
  }

  @SubscribeMessage(RealtimeClientEvent.UNSUBSCRIBE)
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RealtimeSubscribePayload,
  ): void {
    const user = client.data.user as { tenantId: string } | undefined;
    (payload?.deviceIds ?? []).forEach((id) => client.leave(this.deviceRoom(user!.tenantId, id)));
    if (payload?.sceneId) client.leave(this.sceneRoom(user!.tenantId, payload.sceneId));
  }

  /* ---------------- 大屏公开访问票据（Sprint B） ---------------- */

  /**
   * 签发大屏只读票据：用发布令牌换取一枚短时效 JWT，仅供 /screen/:token 的
   * Socket.IO 握手使用。票据用与 Access Token 相同的密钥签名，因此网关能直接验签；
   * 通过 scope=screen 与登录用户区分开，并在订阅时限定场景范围。
   */
  issueScreenTicket(sceneId: string, tenantId: string): { token: string; expiresIn: number } {
    const secret = this.config.get<AppConfig['jwt']>('jwt')!.accessSecret;
    const expiresIn = this.config.get<AppConfig['realtime']>('realtime')!.screenTicketTtlSec;
    const token = this.jwtService.sign(
      { scope: 'screen', sceneId, tenantId, username: 'screen' },
      { secret, expiresIn },
    );
    return { token, expiresIn };
  }

  /* ---------------- 广播入口（供业务模块调用） ---------------- */

  /** 按设备房间广播遥测（订阅方为绑定该设备的节点） */
  broadcastTelemetry(tenantId: string, deviceId: string, payload: unknown): void {
    if (!this.server) return;
    this.server
      .to(this.deviceRoom(tenantId, deviceId))
      .emit(RealtimeServerEvent.TELEMETRY, payload);
  }

  /** 广播设备上下线 */
  broadcastDeviceStatus(tenantId: string, deviceId: string, payload: unknown): void {
    if (!this.server) return;
    this.server
      .to(this.deviceRoom(tenantId, deviceId))
      .emit(RealtimeServerEvent.DEVICE_STATUS, payload);
  }

  /** 广播告警（设备房间 + 场景房间，Sprint 2 规则引擎调用） */
  broadcastAlert(tenantId: string, sceneIds: string[], payload: Record<string, unknown>): void {
    if (!this.server) return;
    const deviceId = (payload.deviceId as string | null | undefined) ?? null;
    if (deviceId) {
      this.server
        .to(this.deviceRoom(tenantId, deviceId))
        .emit(RealtimeServerEvent.ALERT_TRIGGERED, payload);
    }
    sceneIds.forEach((sceneId) =>
      this.server
        .to(this.sceneRoom(tenantId, sceneId))
        .emit(RealtimeServerEvent.ALERT_TRIGGERED, payload),
    );
  }

  /** 在线客户端数（健康检查用） */
  get clientsCount(): number {
    return this.server?.sockets.sockets.size ?? 0;
  }

  private deviceRoom(tenantId: string, deviceId: string): string {
    return `t:${tenantId}:device:${deviceId}`;
  }

  private sceneRoom(tenantId: string, sceneId: string): string {
    return `t:${tenantId}:scene:${sceneId}`;
  }

  private emitErrorAndDisconnect(client: Socket, message: string): void {
    client.emit(RealtimeServerEvent.ERROR, { message });
    client.disconnect(true);
    this.logger.warn(`握手鉴权失败：${message}`);
  }
}
