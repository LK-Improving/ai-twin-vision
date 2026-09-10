/**
 * @dt/rendering-engine — 双引擎渲染内核统一出口。
 *
 * 对外公共 API（签名与平台前端约定一致，不可更改）：
 *   TwinViewer / TwinViewerOptions / TwinEventName / PickResult / PerfStats
 *   CoordinateTransform / ModelLoader / LodController / PerformanceMonitor
 *   RoamController / EffectFactory / createDefaultEngineConfig
 */

import { DEFAULT_ENGINE_CONFIG } from '@dt/shared-types';
import type { EngineConfig, PerfStats } from '@dt/shared-types';

export { TwinViewer } from './core/twin-viewer';
export type { TwinViewerOptions, TwinEventName, PickResult } from './core/twin-viewer';

export { CoordinateTransform } from './fusion/coordinate';
export { ModelLoader } from './three/model-loader';
export type { ModelLoadOptions, ModelFormat } from './three/model-loader';
export { LodController } from './three/lod-controller';
export type { LodDetail } from './three/lod-controller';
export { PerformanceMonitor } from './perf/monitor';
export { RoamController } from './interaction/roam';
export type { RoamStartOptions } from './interaction/roam';
export { EffectFactory } from './three/effects';
export type { EffectType } from './three/effects';

export type { PerfStats } from '@dt/shared-types';

/** 创建一份独立的默认引擎配置副本（避免修改共享常量） */
export function createDefaultEngineConfig(): EngineConfig {
  return JSON.parse(JSON.stringify(DEFAULT_ENGINE_CONFIG)) as EngineConfig;
}
