import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizCode } from '@dt/shared-types';
import { BizException } from '../../common/exceptions/biz.exception';
import { AlertEventEntity, AlertRuleEntity } from './entities';
import { RealtimeGateway } from '../gateway/realtime.gateway';
import { evaluateThreshold } from './alert-evaluator';
import type {
  AlertLevel,
  AlertRuleItem,
  CreateAlertRuleRequest,
  UpdateAlertRuleRequest,
} from '@dt/shared-types';
import { AlertLevel as AlertLevelEnum } from '@dt/shared-types';

/**
 * 告警规则服务（MVP：最小告警）。
 *
 * 职责：
 * 1. 规则 CRUD（租户隔离，物理删除，规则量小无需软删）；
 * 2. 遥测评估 evaluate()：由 DeviceIngestService 在落库广播后调用，
 *    命中阈值写 iot_alert_event 并通过 RealtimeGateway 广播；
 * 3. 内存去重：同一规则持续超阈值期间只写一条事件；值回到安全区间广播"恢复"，
 *    前端据此清除高亮（避免大屏一直红着）。
 *
 * 简化（见《MVP 计划》C 组）：不做条件表达式引擎、不去抖窗口、不做 Webhook/邮件/短信通知。
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  /** deviceId → 启用规则缓存；规则变更时整体失效（规则量小，清空即可） */
  private ruleCache = new Map<string, AlertRuleEntity[]>();
  /** ruleId → 当前激活事件 id（用于去重 + 恢复检测） */
  private activeAlerts = new Map<string, string>();

  constructor(
    @InjectRepository(AlertRuleEntity)
    private readonly ruleRepo: Repository<AlertRuleEntity>,
    @InjectRepository(AlertEventEntity)
    private readonly eventRepo: Repository<AlertEventEntity>,
    private readonly realtime: RealtimeGateway,
  ) {}

  /* ---------------- 规则 CRUD ---------------- */

  async list(tenantId: string): Promise<AlertRuleItem[]> {
    const rules = await this.ruleRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return rules.map((r) => this.toItem(r));
  }

  async create(tenantId: string, dto: CreateAlertRuleRequest): Promise<AlertRuleItem> {
    if (!dto.deviceId) throw new BizException(BizCode.BAD_REQUEST, '告警规则必须绑定设备');
    const rule = this.ruleRepo.create({
      tenantId,
      deviceId: dto.deviceId,
      propertyCode: dto.propertyCode,
      ruleName: dto.ruleName,
      condition: dto.condition,
      threshold: dto.threshold ?? dto.condition.value ?? null,
      alertLevel: dto.alertLevel as number,
      notifyChannel: dto.notifyChannel,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.ruleRepo.save(rule);
    this.invalidateCache();
    return this.toItem(saved);
  }

  async update(tenantId: string, id: string, dto: UpdateAlertRuleRequest): Promise<AlertRuleItem> {
    const rule = await this.requireRule(tenantId, id);
    if (dto.deviceId !== undefined) rule.deviceId = dto.deviceId;
    if (dto.propertyCode !== undefined) rule.propertyCode = dto.propertyCode;
    if (dto.ruleName !== undefined) rule.ruleName = dto.ruleName;
    if (dto.condition !== undefined) rule.condition = dto.condition;
    if (dto.threshold !== undefined) rule.threshold = dto.threshold;
    else if (dto.condition?.value !== undefined) rule.threshold = dto.condition.value;
    if (dto.alertLevel !== undefined) rule.alertLevel = dto.alertLevel as number;
    if (dto.notifyChannel !== undefined) rule.notifyChannel = dto.notifyChannel;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    const saved = await this.ruleRepo.save(rule);
    this.invalidateCache();
    // 规则变化可能导致激活状态失效：清掉该规则的激活标记，下次评估重新判定
    this.activeAlerts.delete(id);
    return this.toItem(saved);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const rule = await this.requireRule(tenantId, id);
    await this.ruleRepo.delete({ id: rule.id });
    this.invalidateCache();
    this.activeAlerts.delete(id);
  }

  /* ---------------- 遥测评估（Sprint 1 实时链路接入） ---------------- */

  /**
   * 评估一批遥测点是否触发告警。
   * @param tenantId 租户
   * @param device 设备标识（id + code），仅用于广播 payload 与缓存键
   * @param points 本次报文的标准遥测点
   */
  async evaluate(
    tenantId: string,
    device: { id: string; deviceCode: string },
    points: Array<{ propertyCode: string; value: number }>,
  ): Promise<void> {
    const rules = await this.loadRules(device.id);
    if (rules.length === 0) return;

    for (const point of points) {
      for (const rule of rules) {
        if (rule.propertyCode !== point.propertyCode) continue;
        const hit = this.matches(rule.condition, rule.threshold, point.value);
        const key = rule.id;

        if (hit) {
          if (this.activeAlerts.has(key)) continue; // 已激活，去重不重复写
          const event = this.eventRepo.create({
            tenantId,
            ruleId: rule.id,
            ruleName: rule.ruleName,
            deviceId: device.id,
            propertyCode: rule.propertyCode,
            triggerValue: point.value,
            alertLevel: rule.alertLevel,
            status: 0,
            message: this.buildMessage(rule, device.deviceCode, point.value),
          });
          await this.eventRepo.save(event);
          this.activeAlerts.set(key, event.id);
          this.realtime.broadcastAlert(tenantId, [], this.toPayload(event, rule, device, 0));
        } else if (this.activeAlerts.has(key)) {
          // 恢复：更新事件为已恢复并广播，前端清除高亮
          const eventId = this.activeAlerts.get(key)!;
          await this.eventRepo.update(eventId, { status: 2, recoveredAt: new Date() });
          const ev = await this.eventRepo.findOne({ where: { id: eventId } });
          this.activeAlerts.delete(key);
          if (ev) this.realtime.broadcastAlert(tenantId, [], this.toPayload(ev, rule, device, 2));
        }
      }
    }
  }

  /** 进程退出/热更新时清理内存态（事件流水已落库，无需补偿） */
  clearRuntimeState(): void {
    this.ruleCache.clear();
    this.activeAlerts.clear();
  }

  /* ---------------- 内部 ---------------- */

  private async requireRule(tenantId: string, id: string): Promise<AlertRuleEntity> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new BizException(BizCode.NOT_FOUND, '告警规则不存在');
    return rule;
  }

  private async loadRules(deviceId: string): Promise<AlertRuleEntity[]> {
    const cached = this.ruleCache.get(deviceId);
    if (cached) return cached;
    const rules = await this.ruleRepo.find({ where: { deviceId, enabled: true } });
    this.ruleCache.set(deviceId, rules);
    return rules;
  }

  private invalidateCache(): void {
    this.ruleCache.clear();
  }

  private matches(
    condition: AlertRuleItem['condition'],
    threshold: number | null,
    value: number,
  ): boolean {
    return evaluateThreshold(condition, threshold, value);
  }

  private buildMessage(rule: AlertRuleEntity, deviceCode: string, value: number): string {
    const opText: Record<string, string> = {
      '>': '高于',
      '>=': '不低于',
      '<': '低于',
      '<=': '不高于',
      '==': '等于',
      '!=': '不等于',
      between: '越界',
      outside: '越界',
    };
    const th =
      rule.threshold ?? rule.condition.value ?? rule.condition.max ?? rule.condition.min ?? 0;
    return `${rule.ruleName}：设备 ${deviceCode} 的 ${rule.propertyCode}=${value} ${opText[rule.condition.operator] ?? ''} 阈值 ${th}`;
  }

  private toItem(r: AlertRuleEntity): AlertRuleItem {
    return {
      id: r.id,
      deviceId: r.deviceId,
      propertyCode: r.propertyCode,
      ruleName: r.ruleName,
      condition: r.condition,
      threshold: r.threshold,
      alertLevel: (r.alertLevel as AlertLevel) ?? AlertLevelEnum.WARNING,
      notifyChannel: r.notifyChannel,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private toPayload(
    event: AlertEventEntity,
    rule: AlertRuleEntity,
    device: { id: string; deviceCode: string },
    status: number,
  ): Record<string, unknown> {
    return {
      eventId: event.id,
      tenantId: event.tenantId,
      ruleId: rule.id,
      ruleName: rule.ruleName,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      propertyCode: rule.propertyCode,
      triggerValue: event.triggerValue,
      alertLevel: rule.alertLevel,
      message: event.message,
      triggeredAt: (event.triggeredAt ?? new Date()).toISOString(),
      status,
      sceneEffect: rule.notifyChannel?.sceneEffect,
    };
  }
}
