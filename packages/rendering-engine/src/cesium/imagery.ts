import * as Cesium from 'cesium';
import type { ImageryLayerConfig } from '@dt/shared-types';

/**
 * 根据影像图层配置构造对应的 Cesium.ImageryLayer。
 *
 * 支持：XYZ / TMS / WMTS / ARCGIS / SINGLE_TILE / ION。
 *
 * 关于 {s} 子域名：
 * UrlTemplateImageryProvider 通过 `subdomains` 字段替换模板中的 {s} 占位符。
 * 对于「数字前缀 + {s}」型（如天地图/高德 `webst0{s}`），约定 subdomains 为 '12345678'，
 * 解析为 webst01..webst08；其余情况回退为默认 'abc'。
 */

/** 根据 URL 推断 {s} 子域名集合 */
function deriveSubdomains(url: string): string {
  if (/(\d*)\{s\}/.test(url)) {
    return '12345678';
  }
  return 'abc';
}

/**
 * 创建单个影像图层。show=false 或创建失败时返回 undefined。
 * 某些 provider（ARCGIS / SINGLE_TILE / ION）为异步构造，因此整体返回 Promise。
 */
export async function createImageryLayer(
  config: ImageryLayerConfig,
  ionToken?: string,
): Promise<Cesium.ImageryLayer | undefined> {
  if (!config.show) return undefined;
  if (!config.url && config.provider !== 'ION') {
    console.warn(`[rendering-engine] 影像图层「${config.name}」缺少 url，已跳过`);
    return undefined;
  }

  try {
    switch (config.provider) {
      case 'XYZ':
      case 'TMS': {
        // TMS 与 XYZ 在网络瓦片模板上一致（y 翻转由瓦片服务约定，这里统一用 WebMercator）
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: config.url as string,
          subdomains: deriveSubdomains(config.url as string),
          maximumLevel: config.maximumLevel,
          credit: new Cesium.Credit(config.name, false),
        });
        return new Cesium.ImageryLayer(provider, {
          alpha: config.alpha ?? 1,
          brightness: config.brightness ?? 1,
        });
      }
      case 'WMTS': {
        const provider = new Cesium.WebMapTileServiceImageryProvider({
          url: config.url as string,
          layer: config.layer ?? '',
          style: config.style ?? 'default',
          format: config.format ?? 'image/jpeg',
          tileMatrixSetID: config.tileMatrixSetID ?? 'GoogleMapsCompatible',
          maximumLevel: config.maximumLevel,
          credit: new Cesium.Credit(config.name, false),
        });
        return new Cesium.ImageryLayer(provider, {
          alpha: config.alpha ?? 1,
          brightness: config.brightness ?? 1,
        });
      }
      case 'ARCGIS': {
        const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(config.url as string);
        return new Cesium.ImageryLayer(provider, {
          alpha: config.alpha ?? 1,
          brightness: config.brightness ?? 1,
        });
      }
      case 'SINGLE_TILE': {
        const provider = await Cesium.SingleTileImageryProvider.fromUrl(config.url as string);
        return new Cesium.ImageryLayer(provider, { alpha: config.alpha ?? 1 });
      }
      case 'ION': {
        // 无 token 时直接跳过，避免访问 Ion 默认服务（离线场景）
        if (!ionToken && !Cesium.Ion.defaultAccessToken) {
          console.warn(`[rendering-engine] ION 影像「${config.name}」缺少 token，已跳过`);
          return undefined;
        }
        const provider = await Cesium.IonImageryProvider.fromAssetId(config.assetId ?? 1);
        return new Cesium.ImageryLayer(provider, { alpha: config.alpha ?? 1 });
      }
      default:
        return undefined;
    }
  } catch (err) {
    console.error(`[rendering-engine] 影像图层「${config.name}」创建失败:`, err);
    return undefined;
  }
}
