import * as THREE from 'three';

/**
 * Three.js 资源深度释放工具。
 * 数字孪生大屏长时间运行，未释放的 geometry / material / texture 会造成显存泄漏，
 * 因此删除实体时必须递归遍历并 dispose 全部 GPU 资源。
 */

/** 释放单个材质及其关联贴图 */
export function disposeMaterial(material: THREE.Material): void {
  const mat = material as unknown as Record<string, unknown>;
  // 遍历材质上所有可能挂贴图的字段
  for (const key of Object.keys(mat)) {
    const value = mat[key];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

/** 深度释放一个 Object3D 子树占用的几何体与材质 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      material.forEach((m) => disposeMaterial(m));
    } else if (material) {
      disposeMaterial(material);
    }
  });
  // 从父节点摘除，避免残留引用
  if (root.parent) {
    root.parent.remove(root);
  }
}

/** 释放一组纹理 */
export function disposeTextures(textures: Array<THREE.Texture | undefined | null>): void {
  for (const t of textures) {
    if (t) t.dispose();
  }
}
