import type * as THREE from 'three';
import type { SceneComponentInstance, CameraView, PerfStats } from '@dt/shared-types';
import type { PickResult } from './core/twin-viewer';

/** 实体归属引擎 */
export type EngineName = 'CESIUM' | 'THREE';

/**
 * 引擎内部维护的实体记录。
 * 一条 SceneComponentInstance 在运行时对应一条 TwinEntity，
 * 它同时持有两个引擎的引用之一（cesiumRef / threeObject）。
 */
export interface TwinEntity {
  id: string;
  /** 原始实例数据（结构化后会被 updateEntity 改写） */
  instance: SceneComponentInstance;
  /** 由哪个引擎渲染 */
  engine: EngineName;
  /** 所属图层 ID（可能为 null） */
  layerId: string | null;
  /** Cesium 侧引用（Entity / Cesium3DTileset / Primitive 等） */
  cesiumRef?: unknown;
  /** Three 侧引用（已加入场景的 Object3D 根节点） */
  threeObject?: THREE.Object3D;
  /** 当前可见性 */
  visible: boolean;
  /** 高亮颜色（十六进制字符串），清除高亮时为 undefined */
  highlightColor?: string;
  /** 用于 LOD 切换的当前细节层级 */
  currentDetail?: 'HIGH' | 'MEDIUM' | 'LOW' | 'HIDDEN';
  /** MODEL_3D 当前加载的模型 URL（用于 LOD 卸载引用计数） */
  modelUrl?: string;
  /** PARTICLE 类型特效在 EffectFactory 中的 id */
  effectId?: string;
  /** LOD 切换进行中标记，避免并发重复加载 */
  swapping?: boolean;
}

/** 高亮选项 */
export interface HighlightOptions {
  /** 高亮颜色（如 '#ff0000'），默认黄色 */
  color?: string;
  /** 是否使用自发光强调（仅 Three 模型有效） */
  emissive?: boolean;
}

/**
 * 双引擎对外事件载荷映射表。
 * TwinViewer.on / TwinViewer.off 基于此表做类型安全约束。
 */
export interface TwinEventMap {
  ready: void;
  click: PickResult;
  dblclick: PickResult;
  hover: PickResult;
  'camera-change': CameraView;
  'entity-added': { id: string; engine: EngineName };
  'entity-removed': { id: string };
  stats: PerfStats;
  degrade: { reason: string; level: string; detail: 'HIGH' | 'MEDIUM' | 'LOW' | 'HIDDEN' };
  error: { message: string; error?: unknown };
}

/** 角度转弧度辅助（多用于欧拉角） */
export type Vec3 = { x: number; y: number; z: number };
