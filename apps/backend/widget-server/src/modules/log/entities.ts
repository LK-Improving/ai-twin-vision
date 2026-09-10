import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** 操作日志表 sys_operation_log */
@Entity('sys_operation_log')
@Index('idx_oplog_tenant_time', ['tenantId', 'createdAt'])
export class OperationLogEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'username', length: 50 })
  username: string;

  @Column({ name: 'module', length: 100 })
  module: string;

  @Column({ name: 'action', length: 100 })
  action: string;

  @Column({ name: 'request_method', length: 10 })
  requestMethod: string;

  @Column({ name: 'request_url', length: 500 })
  requestUrl: string;

  @Column({ name: 'request_params', type: 'jsonb', nullable: true })
  requestParams: Record<string, unknown> | null;

  @Column({ name: 'response_status', type: 'int' })
  responseStatus: number;

  /** 响应耗时（毫秒） */
  @Column({ name: 'response_time', type: 'int' })
  responseTime: number;

  @Column({ name: 'ip_address', length: 45 })
  ipAddress: string;

  @Column({ name: 'user_agent', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}

/** 系统日志表 sys_system_log */
@Entity('sys_system_log')
@Index('idx_syslog_level_time', ['level', 'createdAt'])
export class SystemLogEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  /** DEBUG / INFO / WARN / ERROR / FATAL */
  @Column({ name: 'level', length: 10 })
  level: string;

  @Column({ name: 'logger', length: 200 })
  logger: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'exception', type: 'jsonb', nullable: true })
  exception: Record<string, unknown> | null;

  @Column({ name: 'stack_trace', type: 'text', nullable: true })
  stackTrace: string | null;

  @Column({ name: 'hostname', length: 100, nullable: true })
  hostname: string | null;

  @Column({ name: 'trace_id', length: 64, nullable: true })
  traceId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;
}
