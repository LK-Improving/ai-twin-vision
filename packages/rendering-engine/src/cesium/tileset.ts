import * as Cesium from 'cesium';
import type { TilesetConfig } from '@dt/shared-types';

/**
 * 加载 3D Tiles（倾斜摄影 / BIM 切片）。
 *
 * - heightOffset：通过矩阵抬升整层瓦片高度（局部 ENU 的「天」方向，单位米）；
 * - maximumScreenSpaceError：屏幕空间误差，越大越省性能；
 * - cacheBytes：显存上限（换算为字节），超限时 Cesium 自动回收；
 * - colorBlendMode / style：允许运行时对要素着色。
 */
const COLOR_BLEND_MODE: Record<NonNullable<TilesetConfig['colorBlendMode']>, Cesium.Cesium3DTileColorBlendMode> = {
  HIGHLIGHT: Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT,
  REPLACE: Cesium.Cesium3DTileColorBlendMode.REPLACE,
  MIX: Cesium.Cesium3DTileColorBlendMode.MIX,
};

export async function createTileset(
  config: TilesetConfig,
): Promise<Cesium.Cesium3DTileset | undefined> {
  if (!config.show) return undefined;
  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(config.url, {
      maximumScreenSpaceError: config.maximumScreenSpaceError ?? 16,
    });

    // 高度偏移：在根节点 transform 上叠加一个「竖直平移」矩阵
    if (config.heightOffset && config.heightOffset !== 0) {
      const offset = Cesium.Matrix4.fromTranslation(
        new Cesium.Cartesian3(0, 0, config.heightOffset),
      );
      Cesium.Matrix4.multiply(offset, tileset.root.transform, tileset.root.transform);
    }

    if (config.cacheBytes && config.cacheBytes > 0) {
      tileset.maximumCacheOverflowBytes = config.cacheBytes * 1024 * 1024;
    }

    if (config.colorBlendMode) {
      tileset.colorBlendMode = COLOR_BLEND_MODE[config.colorBlendMode];
    }

    if (config.style) {
      tileset.style = new Cesium.Cesium3DTileStyle(config.style);
    }

    return tileset;
  } catch (err) {
    console.error(`[rendering-engine] 3D Tiles「${config.name}」加载失败:`, err);
    return undefined;
  }
}
