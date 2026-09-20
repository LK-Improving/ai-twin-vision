import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import type { ThreeConfig } from '@dt/shared-types';
import { EffectFactory } from './effects';

export interface ThreeEngineOptions {
  container: HTMLElement;
  config: ThreeConfig;
}

/** 色调映射枚举 → THREE 常量 */
function mapToneMapping(name?: string): THREE.ToneMapping {
  switch (name) {
    case 'LINEAR':
      return THREE.LinearToneMapping;
    case 'REINHARD':
      return THREE.ReinhardToneMapping;
    case 'CINEON':
      return THREE.CineonToneMapping;
    case 'ACES_FILMIC':
      return THREE.ACESFilmicToneMapping;
    case 'NONE':
    default:
      return THREE.NoToneMapping;
  }
}

/**
 * Three.js 微观引擎封装。
 *
 * - 使用以锚点为原点的 ENU 局部坐标；
 * - renderer 开启 alpha + autoClear:false，画布竖直流叠在 Cesium 之上且 pointer-events:none，
 *   拾取由统一 picker 处理；
 * - 可选后处理：Bloom / Outline（Outline 用于实体高亮）；
 * - 渲染循环由外部主 rAF 驱动（每帧先同步相机再 render）。
 */
export class ThreeEngine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;

  private readonly container: HTMLElement;
  private config: ThreeConfig;
  private composer?: EffectComposer;
  private renderPass?: RenderPass;
  private bloomPass?: UnrealBloomPass;
  private outlinePass?: OutlinePass;
  private ambient?: THREE.AmbientLight;
  private dirLight?: THREE.DirectionalLight;

  /** 告警/环境特效工厂 */
  readonly effects: EffectFactory;
  private pixelRatioLimit: number;

  constructor(opts: ThreeEngineOptions) {
    this.container = opts.container;
    this.config = opts.config;
    this.pixelRatioLimit = opts.config.renderer?.pixelRatioLimit ?? 2;
    // 近裁剪面很小、远裁剪面很大，以覆盖 ENU 局部空间（米）
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200000);
    this.effects = new EffectFactory(this.scene);
    this.initRenderer();
    this.applyEnvironment();
    this.initPostProcessing();
  }

  private initRenderer(): void {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: this.config.renderer?.antialias ?? true,
      // 截图需要从画布读取像素
      preserveDrawingBuffer: true,
    });
    // 双引擎叠加：关闭自动清除，由渲染循环手动控制（autoClear 为实例属性而非构造参数）
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioLimit));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = !!this.config.renderer?.shadowMap;

    // 将 Three 画布叠加在 Cesium 画布之上
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    this.container.appendChild(canvas);
    this.resize();
  }

  private applyEnvironment(): void {
    const env = this.config.environment;
    const ambientIntensity = env?.ambientIntensity ?? 0.6;
    this.ambient = new THREE.AmbientLight(0xffffff, ambientIntensity);
    this.scene.add(this.ambient);

    const dirIntensity = env?.directionalIntensity ?? 1.2;
    this.dirLight = new THREE.DirectionalLight(0xffffff, dirIntensity);
    const dp = env?.directionalPosition ?? { x: 50, y: 80, z: 50 };
    this.dirLight.position.set(dp.x, dp.y, dp.z);
    this.dirLight.castShadow = !!this.config.renderer?.shadowMap;
    this.scene.add(this.dirLight);

    this.renderer.toneMapping = mapToneMapping(env?.toneMapping);
    this.renderer.toneMappingExposure = env?.exposure ?? 1;
  }

  private initPostProcessing(): void {
    const pp = this.config.postProcessing;
    if (!pp) return;
    const size = new THREE.Vector2(
      this.container.clientWidth || 1,
      this.container.clientHeight || 1,
    );
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);

    if (pp.bloom) {
      // strength/radius 拉高一档：大屏场景的楼体棱线、发光描边需要明显泛光
      // threshold 0.8：略高于白模漫反射亮度，只让 emissive 元素起光晕
      this.bloomPass = new UnrealBloomPass(size, 1.25, 0.55, 0.8);
      composer.addPass(this.bloomPass);
    }
    if (pp.outline) {
      this.outlinePass = new OutlinePass(size, this.scene, this.camera);
      this.outlinePass.edgeStrength = 3;
      this.outlinePass.edgeGlow = 0.4;
      composer.addPass(this.outlinePass);
    }
    this.composer = composer;
    this.resize();
  }

  /** 设置 OutlinePass 高亮目标（空数组清除高亮） */
  setOutlineTarget(objects: THREE.Object3D[]): void {
    if (this.outlinePass) {
      this.outlinePass.selectedObjects = objects;
    }
  }

  /** 设置 Outline 颜色（如高亮告警色） */
  setOutlineColor(color: string): void {
    if (this.outlinePass) {
      this.outlinePass.visibleEdgeColor.set(color);
      this.outlinePass.hiddenEdgeColor.set(color);
    }
  }

  /** 推进特效动画并渲染一帧（autoClear=false，手动清后渲染） */
  render(dt: number): void {
    this.effects.update(dt);
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** 同步尺寸（容器变化或窗口缩放时调用） */
  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  }

  /** 运行时更新环境/光照配置 */
  update(config: ThreeConfig): void {
    this.config = config;
    const env = config.environment;
    if (this.ambient && env?.ambientIntensity !== undefined) {
      this.ambient.intensity = env.ambientIntensity;
    }
    if (this.dirLight && env?.directionalIntensity !== undefined) {
      this.dirLight.intensity = env.directionalIntensity;
    }
    if (env?.toneMapping !== undefined) {
      this.renderer.toneMapping = mapToneMapping(env.toneMapping);
    }
    if (env?.exposure !== undefined) {
      this.renderer.toneMappingExposure = env.exposure;
    }
  }

  /** 释放全部 Three 资源 */
  destroy(): void {
    this.effects.clear();
    this.composer?.dispose();
    this.bloomPass?.dispose();
    this.outlinePass?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      const canvas = this.renderer.domElement;
      if (canvas.parentElement === this.container) {
        this.container.removeChild(canvas);
      }
    }
  }
}
