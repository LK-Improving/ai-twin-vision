import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { disposeObject3D, disposeMaterial } from '../utils/dispose';

/** 支持的模型格式 */
export type ModelFormat = 'GLTF' | 'GLB' | 'FBX' | 'OBJ' | 'AUTO';

export interface ModelLoadOptions {
  /** 显式指定格式，缺省按扩展名推断 */
  format?: ModelFormat;
  /** 进度回调，0-100 */
  onProgress?: (percent: number) => void;
}

export interface ModelLoaderOptions {
  /** DRACO 解码器路径（gltf 压缩几何），默认 /draco/ */
  dracoPath?: string;
  /** KTX2 / Basis 转码器路径，默认 /basis/ */
  ktx2Path?: string;
  /** 用于 KTX2 能力探测的渲染器 */
  renderer?: THREE.WebGLRenderer;
}

/**
 * 模型加载器。
 *
 * - 支持 GLTF/GLB（可选 DRACO 压缩几何、KTX2 压缩贴图）、FBX、OBJ；
 * - 按 url 做源缓存（source cache），相同模型只解码一次，实体使用 clone 复用；
 * - 引用计数管理：实体移除时 unref，计数为 0 才真正 dispose 源资源，避免重复释放共享几何；
 * - onProgress 透传解码进度。
 */
export class ModelLoader {
  private readonly gltfLoader = new GLTFLoader();
  private readonly fbxLoader = new FBXLoader();
  private readonly objLoader = new OBJLoader();
  private readonly dracoLoader?: DRACOLoader;
  private readonly ktx2Loader?: KTX2Loader;

  /** url → 已解码的源对象（尚未加入场景，供 clone 使用） */
  private readonly sources = new Map<string, THREE.Object3D>();
  /** url → 引用计数 */
  private readonly refCounts = new Map<string, number>();
  /** 已注册的 onProgress（按 url 暂存） */
  private readonly progressMap = new Map<string, (percent: number) => void>();

  constructor(opts: ModelLoaderOptions = {}) {
    const dracoPath = opts.dracoPath ?? '/draco/';
    const ktx2Path = opts.ktx2Path ?? '/basis/';

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(dracoPath);
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    if (opts.renderer) {
      this.ktx2Loader = new KTX2Loader();
      this.ktx2Loader.setTranscoderPath(ktx2Path);
      this.ktx2Loader.detectSupport(opts.renderer);
      this.gltfLoader.setKTX2Loader(this.ktx2Loader);
    }
  }

  /** 按扩展名推断模型格式 */
  private static guessFormat(url: string): ModelFormat {
    const lower = url.toLowerCase().split('?')[0];
    if (lower.endsWith('.glb')) return 'GLB';
    if (lower.endsWith('.gltf')) return 'GLTF';
    if (lower.endsWith('.fbx')) return 'FBX';
    if (lower.endsWith('.obj')) return 'OBJ';
    return 'AUTO';
  }

  /** 加载模型，返回已加入场景可用的对象（源的 clone）。 */
  load(url: string, options: ModelLoadOptions = {}): Promise<THREE.Object3D> {
    const format = options.format ?? ModelLoader.guessFormat(url);
    if (options.onProgress) this.progressMap.set(url, options.onProgress);

    return new Promise<THREE.Object3D>((resolve, reject) => {
      const source = this.sources.get(url);
      if (source) {
        this.bumpRef(url);
        resolve(source.clone(true));
        return;
      }

      const onProgress = (evt: ProgressEvent) => {
        const cb = this.progressMap.get(url);
        if (cb && evt.total > 0) cb(Math.round((evt.loaded / evt.total) * 100));
      };

      const onLoaded = (obj: THREE.Object3D) => {
        this.sources.set(url, obj);
        this.refCounts.set(url, 0);
        this.bumpRef(url);
        this.progressMap.delete(url);
        resolve(obj.clone(true));
      };

      try {
        switch (format) {
          case 'FBX':
            this.fbxLoader.load(url, onLoaded, onProgress, (e) => reject(e));
            break;
          case 'OBJ':
            this.objLoader.load(url, onLoaded, onProgress, (e) => reject(e));
            break;
          case 'GLTF':
          case 'GLB':
          case 'AUTO':
          default:
            this.gltfLoader.load(
              url,
              (gltf) => onLoaded(gltf.scene),
              onProgress,
              (e) => reject(e),
            );
            break;
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /** 增加一次引用计数 */
  private bumpRef(url: string): void {
    const n = this.refCounts.get(url) ?? 0;
    this.refCounts.set(url, n + 1);
  }

  /**
   * 释放一个实体持有的模型引用。
   * 计数归零时真正 dispose 源资源（几何体 / 材质 / 贴图）。
   */
  unref(url: string): void {
    const n = this.refCounts.get(url);
    if (n === undefined) return;
    if (n <= 1) {
      const source = this.sources.get(url);
      if (source) disposeObject3D(source);
      this.sources.delete(url);
      this.refCounts.delete(url);
    } else {
      this.refCounts.set(url, n - 1);
    }
  }

  /** 是否已在缓存中 */
  has(url: string): boolean {
    return this.sources.has(url);
  }

  /** 释放该 url 对应源的全部资源（即使仍有引用也会强制清理） */
  disposeSource(url: string): void {
    const source = this.sources.get(url);
    if (source) disposeObject3D(source);
    this.sources.delete(url);
    this.refCounts.delete(url);
  }

  /** 释放全部已加载模型资源（destroy 时调用） */
  dispose(): void {
    for (const source of this.sources.values()) {
      disposeObject3D(source);
    }
    this.sources.clear();
    this.refCounts.clear();
    this.progressMap.clear();
    // 释放解码器 Worker
    this.dracoLoader?.dispose();
    this.ktx2Loader?.dispose();
  }
}

/** 重新导出，便于调用方统一释放单个对象 */
export { disposeObject3D, disposeMaterial };
