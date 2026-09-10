/**
 * 编辑器状态中枢（Pinia setup store）。
 *
 * 重要约束：
 * - 引擎实例（TwinViewer）必须放在组件内，绝不放进 Pinia，避免响应式代理污染
 *   WebGL / Cesium 对象。本 store 只保存可序列化的状态。
 * - 所有结构性变更都通过 useUndoRedo 记录快照，支持 Ctrl+Z / Ctrl+Shift+Z 撤销重做。
 * - 属性/拖拽等连续操作通过 mergeKey 合并成单条历史，避免历史栈爆炸。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  CameraView,
  EngineConfig,
  SceneLayer,
  SceneComponentInstance,
  Transform,
  PerfStats,
  WidgetNode,
  WidgetRect,
  PageSchema,
  EventBinding,
  EventAction,
  ComponentType as ComponentTypeEnum,
} from '@dt/shared-types';
import {
  EMPTY_PAGE_SCHEMA,
  ComponentType,
  DEFAULT_ENGINE_CONFIG,
  ActionType,
} from '@dt/shared-types';
import { getWidget } from '@dt/widgets';
import { useUndoRedo } from '@/composables/useUndoRedo';
import { deepClone, deepMerge, uid } from '@/views/editor/utils/object';
import { http } from '@/services/request';
import * as sceneApi from '@/services/api/scene';
import { useToast } from '@/composables/useToast';
import type { SceneDetail, UpdateSceneRequest } from '@dt/shared-types';
import type { ComponentListItem, DataSourceItem, PageResult } from '@dt/shared-types';

/** 模型资产项（后端 /model-assets 返回，结构以实际接口为准，这里仅声明用到的字段） */
export interface ModelAssetItem {
  id: string;
  name: string;
  url: string;
  type?: string;
  thumbnailUrl?: string;
}

/** 右侧属性面板 Tab */
export type RightTab = 'prop' | 'data' | 'event' | 'style';

/** 对齐/分布操作类型 */
export type AlignType =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'centerH'
  | 'centerV'
  | 'distributeH'
  | 'distributeV';

/** 选中态统一包装 */
export type SelectedWrapper =
  | { kind: '3D'; id: string; data: SceneComponentInstance }
  | { kind: '2D'; id: string; data: WidgetNode };

/** 撤销重做快照：仅包含可序列化、需要回退的结构性状态 */
interface EditSnapshot {
  page: PageSchema;
  components: SceneComponentInstance[];
  layers: SceneLayer[];
}

/** 画布视口坐标（屏幕像素） */
export interface CanvasOffset {
  x: number;
  y: number;
}

export const useEditorStore = defineStore('editor', () => {
  const toast = useToast();

  // -------------------------------------------------------------- 基础态
  const sceneId = ref('');
  const sceneDetail = ref<SceneDetail | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const publishing = ref(false);
  const dirty = ref(false);
  /** 自动保存开关（脏数据每 60s 自动 PUT 一次） */
  const autoSaveEnabled = ref(true);

  /** 引擎配置（响应式，深监听后下发给 TwinViewer.applyConfig） */
  const engineConfig = ref<EngineConfig>(deepClone(DEFAULT_ENGINE_CONFIG));

  /** 三维实体实例列表 */
  const components = ref<SceneComponentInstance[]>([]);

  /** 2D 大屏节点树 + 事件 + 变量 */
  const page = ref<PageSchema>(deepClone(EMPTY_PAGE_SCHEMA));

  /** 组件库目录（GET /components 拉取，用于三维组件拖拽与类型解析） */
  const componentCatalog = ref<ComponentListItem[]>([]);
  /** 数据源列表（GET /data-sources） */
  const dataSources = ref<DataSourceItem[]>([]);
  /** 模型资产（GET /model-assets） */
  const modelAssets = ref<ModelAssetItem[]>([]);

  /** 性能状态栏数据（由引擎 stats 事件写入） */
  const perfStats = ref<PerfStats>({
    fps: 0,
    memoryMb: 0,
    drawCalls: 0,
    triangles: 0,
    entityCount: 0,
  });

  /** 当前相机视角（由引擎 camera-change 事件实时写入，供「取当前视角」使用） */
  const currentCamera = ref<CameraView>(deepClone(engineConfig.value.cesium.initialView));

  function setCurrentCamera(v: CameraView): void {
    currentCamera.value = { ...v };
  }

  // -------------------------------------------------------------- 选中态
  const selectedIds = ref<string[]>([]);

  const selectedNode = computed<SelectedWrapper | null>(() => {
    const id = selectedIds.value[0];
    if (!id) return null;
    const comp = components.value.find((c) => c.id === id);
    if (comp) return { kind: '3D', id, data: comp };
    const node = findNode(page.value.nodes, id);
    return node ? { kind: '2D', id, data: node } : null;
  });

  /** 全部选中项的统一包装（含多选） */
  const selectedWrappers = computed<SelectedWrapper[]>(() => {
    const out: SelectedWrapper[] = [];
    for (const id of selectedIds.value) {
      const comp = components.value.find((c) => c.id === id);
      if (comp) {
        out.push({ kind: '3D', id, data: comp });
        continue;
      }
      const node = findNode(page.value.nodes, id);
      if (node) out.push({ kind: '2D', id, data: node });
    }
    return out;
  });

  // -------------------------------------------------------------- 视图态
  const canvasScale = ref(1);
  const canvasOffset = ref<CanvasOffset>({ x: 0, y: 0 });
  const showGrid = ref(true);
  const showRuler = ref(true);
  const previewMode = ref(false);
  const activeRightTab = ref<RightTab>('prop');

  /** 图层（取自 engineConfig.layers，保持单一数据源） */
  const layers = computed<SceneLayer[]>(() => engineConfig.value.layers);

  // -------------------------------------------------------------- 历史栈
  function makeSnapshot(): EditSnapshot {
    return {
      page: deepClone(page.value),
      components: deepClone(components.value),
      layers: deepClone(engineConfig.value.layers),
    };
  }
  function applySnapshot(s: EditSnapshot): void {
    page.value = deepClone(s.page);
    components.value = deepClone(s.components);
    engineConfig.value.layers = deepClone(s.layers);
  }

  const history = useUndoRedo<EditSnapshot>(makeSnapshot(), {
    limit: 50,
    mergeWindowMs: 600,
  });

  /** 提交一次结构性变更（标记脏 + 入历史栈） */
  function commit(mergeKey?: string): void {
    dirty.value = true;
    history.push(makeSnapshot(), mergeKey);
  }

  /** 拖拽/缩放结束时由交互层调用，合并成单条历史 */
  function commitDrag(id: string): void {
    commit(`drag:${id}`);
  }

  // -------------------------------------------------------------- 节点查找
  function findNode(list: WidgetNode[], id: string): WidgetNode | null {
    for (const n of list) {
      if (n.id === id) return n;
      if (n.children?.length) {
        const r = findNode(n.children, id);
        if (r) return r;
      }
    }
    return null;
  }

  function reassignIds(node: WidgetNode): void {
    node.id = uid('w');
    if (node.children?.length) node.children.forEach(reassignIds);
  }

  /** 在父数组中，把 clone 插入到 targetId 之后（找不到则追加到顶层） */
  function insertAfter(list: WidgetNode[], targetId: string, clone: WidgetNode): boolean {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === targetId) {
        list.splice(i + 1, 0, clone);
        return true;
      }
      if (list[i].children?.length && insertAfter(list[i].children!, targetId, clone)) return true;
    }
    return false;
  }

  function filterNodes(list: WidgetNode[], dead: Set<string>): WidgetNode[] {
    const out: WidgetNode[] = [];
    for (const n of list) {
      if (dead.has(n.id)) continue;
      if (n.children?.length) n.children = filterNodes(n.children, dead);
      out.push(n);
    }
    return out;
  }

  // -------------------------------------------------------------- 加载/保存
  async function loadScene(id: string): Promise<void> {
    sceneId.value = id;
    loading.value = true;
    try {
      const detail = await sceneApi.getSceneDetailApi(id);
      sceneDetail.value = detail;
      // 引擎配置：直接复用后端返回的 config（默认兜底）
      engineConfig.value = deepClone(detail.config ?? DEFAULT_ENGINE_CONFIG);
      components.value = deepClone(detail.components ?? []);
      // 2D 节点树 + 事件/变量：后端若随场景返回完整 page 则优先使用
      const pageData = (detail as SceneDetail & { page?: PageSchema }).page;
      if (pageData) {
        page.value = deepClone({ ...EMPTY_PAGE_SCHEMA, ...pageData });
      } else {
        page.value = deepClone({
          ...EMPTY_PAGE_SCHEMA,
          nodes: deepClone(detail.layout?.nodes ?? []),
        });
      }
      // 初次进入：历史栈基线重置为当前快照
      history.reset(makeSnapshot());
      dirty.value = false;
      selectedIds.value = [];
      await Promise.all([loadComponentCatalog(), loadDataSources(), loadModelAssets()]);
    } catch (err) {
      toast.error('场景加载失败');
      // 加载失败也要给出可编辑的默认环境，避免白屏
      engineConfig.value = deepClone(DEFAULT_ENGINE_CONFIG);
    } finally {
      loading.value = false;
    }
  }

  async function save(): Promise<boolean> {
    if (!sceneId.value) return false;
    saving.value = true;
    try {
      const body: UpdateSceneRequest = {
        name: sceneDetail.value?.name ?? '未命名场景',
        description: sceneDetail.value?.description ?? undefined,
        config: engineConfig.value,
        components: components.value.map((c) => deepClone(c)),
        layout: deepClone(page.value),
      };
      // 事件与变量随页面保存（若后端支持读取 page 字段则一并落库）
      const fullBody = {
        ...body,
        page: deepClone(page.value),
      } as UpdateSceneRequest & { page?: PageSchema };
      const updated = await sceneApi.updateSceneApi(sceneId.value, fullBody);
      sceneDetail.value = updated;
      dirty.value = false;
      toast.success('已保存');
      return true;
    } catch (err) {
      toast.error('保存失败，请重试');
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function publish(changeLog?: string): Promise<boolean> {
    if (!sceneId.value) return false;
    publishing.value = true;
    try {
      // 发布前先确保最新数据已落库
      if (dirty.value) await save();
      const res = await sceneApi.publishSceneApi(sceneId.value, { changeLog });
      toast.success(`发布成功：${res.version}`);
      return true;
    } catch (err) {
      toast.error('发布失败，请重试');
      return false;
    } finally {
      publishing.value = false;
    }
  }

  // -------------------------------------------------------------- 目录/资源
  async function loadComponentCatalog(): Promise<void> {
    try {
      const res = await http.get<PageResult<ComponentListItem>>('/components', { params: { limit: 200 } });
      componentCatalog.value = res.dataList ?? [];
    } catch {
      componentCatalog.value = [];
    }
  }

  async function loadDataSources(): Promise<void> {
    try {
      const res = await http.get<PageResult<DataSourceItem>>('/data-sources', { params: { limit: 200 } });
      dataSources.value = res.dataList ?? [];
    } catch {
      dataSources.value = [];
    }
  }

  async function loadModelAssets(): Promise<void> {
    try {
      const res = await http.get<ModelAssetItem[]>('/model-assets');
      modelAssets.value = Array.isArray(res) ? res : ((res as PageResult<ModelAssetItem>)?.dataList ?? []);
    } catch {
      modelAssets.value = [];
    }
  }

  function getComponentItem(componentId: string): ComponentListItem | undefined {
    return componentCatalog.value.find((c) => c.id === componentId);
  }

  // -------------------------------------------------------------- 2D 节点
  function addWidget(type: string, position?: { x: number; y: number }): void {
    const def = getWidget(type);
    const baseRect = def?.defaultRect ?? { x: 0, y: 0, width: 200, height: 120 };
    const rect: WidgetRect = {
      ...deepClone(baseRect),
      x: position?.x ?? 80,
      y: position?.y ?? 80,
    };
    const node: WidgetNode = {
      id: uid('w'),
      type,
      name: def?.name ?? type,
      componentId: def?.type,
      rect,
      props: deepClone(def?.defaultProps ?? {}),
      visible: true,
      locked: false,
      layerId: 'layer-ui',
    };
    page.value.nodes.push(node);
    selectNodes([node.id]);
    commit('add-widget');
  }

  async function add3DComponent(componentId: string, transform?: Transform): Promise<void> {
    const item = getComponentItem(componentId);
    const type: string = item?.componentType ?? ComponentType.MODEL_3D;
    const view = engineConfig.value.cesium.initialView;
    const inst: SceneComponentInstance = {
      id: uid('c'),
      sceneId: sceneId.value,
      componentId,
      componentType: type,
      name: item?.name ?? '三维组件',
      componentConfig: {},
      position:
        transform ??
        ({
          cartographic: { longitude: view.longitude, latitude: view.latitude, height: 0 },
        } as Transform),
      layerId: engineConfig.value.cesium.enabled ? 'layer-gis' : 'layer-model',
      sortOrder: components.value.length,
      visible: true,
      locked: false,
    };
    components.value.push(inst);
    selectNodes([inst.id]);
    commit('add-3d');
  }

  /** 更新 2D 节点（深合并 props，部分字段浅合并），进撤销栈 */
  function updateNode(id: string, patch: Partial<WidgetNode>, mergeKey?: string): void {
    const node = findNode(page.value.nodes, id);
    if (!node) return;
    const { props, rect, ...rest } = patch;
    Object.assign(node, rest);
    if (rect) node.rect = { ...node.rect, ...rect };
    if (props) node.props = deepMerge(node.props ?? {}, props);
    commit(mergeKey ?? `node:${id}`);
  }

  function removeNodes(ids: string[]): void {
    if (ids.length === 0) return;
    const dead = new Set(ids);
    page.value.nodes = filterNodes(page.value.nodes, dead);
    components.value = components.value.filter((c) => !dead.has(c.id));
    // 清理引用了被删节点的事件绑定与动作
    page.value.events = page.value.events.filter(
      (e) => !dead.has(e.sourceId) && !e.actions.some((a) => dead.has(a.targetId ?? '')),
    );
    selectedIds.value = selectedIds.value.filter((id) => !dead.has(id));
    commit('remove');
  }

  function duplicateNode(id: string): void {
    const node = findNode(page.value.nodes, id);
    if (!node) return;
    const clone = deepClone(node);
    reassignIds(clone);
    clone.rect = { ...clone.rect, x: clone.rect.x + 24, y: clone.rect.y + 24 };
    if (!insertAfter(page.value.nodes, id, clone)) {
      page.value.nodes.push(clone);
    }
    selectNodes([clone.id]);
    commit('duplicate');
  }

  /** 拖动/缩放过程中更新矩形（不进栈，松手时由 commitDrag 入栈） */
  function moveNode(id: string, rect: Partial<WidgetRect>): void {
    const node = findNode(page.value.nodes, id);
    if (!node) return;
    node.rect = { ...node.rect, ...rect };
    dirty.value = true;
  }

  /** 更新三维组件实例（如 Transform 编辑器写回位置变换） */
  function updateComponent(
    id: string,
    patch: Partial<SceneComponentInstance>,
    mergeKey?: string,
  ): void {
    const c = components.value.find((x) => x.id === id);
    if (!c) return;
    const { position, componentConfig, ...rest } = patch;
    Object.assign(c, rest);
    if (position) c.position = { ...c.position, ...position };
    if (componentConfig) c.componentConfig = { ...c.componentConfig, ...componentConfig };
    commit(mergeKey ?? `comp:${id}`);
  }

  /** 重新排布同层节点顺序（orderedIds 为新的从底到顶顺序） */
  function reorderLayer(layerId: string, orderedIds: string[]): void {
    orderedIds.forEach((cid, i) => {
      const c = components.value.find((x) => x.id === cid);
      if (c) c.sortOrder = i;
      const n = findNode(page.value.nodes, cid);
      if (n && n.layerId === layerId) n.rect.zIndex = i + 1;
    });
    commit('reorder');
  }

  function setLayerVisible(layerId: string, visible: boolean): void {
    const layer = engineConfig.value.layers.find((l) => l.id === layerId);
    if (layer) layer.visible = visible;
    commit(`layer-vis:${layerId}`);
  }

  function toggleNodeVisible(id: string): void {
    const comp = components.value.find((c) => c.id === id);
    if (comp) {
      comp.visible = !comp.visible;
      commit(`vis:${id}`);
      return;
    }
    const node = findNode(page.value.nodes, id);
    if (node) {
      node.visible = !node.visible;
      commit(`vis:${id}`);
    }
  }

  function lockNode(id: string): void {
    const comp = components.value.find((c) => c.id === id);
    if (comp) {
      comp.locked = !comp.locked;
      commit(`lock:${id}`);
      return;
    }
    const node = findNode(page.value.nodes, id);
    if (node) {
      node.locked = !node.locked;
      commit(`lock:${id}`);
    }
  }

  function alignNodes(type: AlignType): void {
    const sel = selectedWrappers.value.filter((w) => w.kind === '2D') as Array<{
      id: string;
      data: WidgetNode;
    }>;
    if (sel.length < 2) return;
    const rects = sel.map((s) => s.data.rect);
    const minX = Math.min(...rects.map((r) => r.x));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxY = Math.max(...rects.map((r) => r.y + r.height));
    for (const s of sel) {
      const r = s.data.rect;
      switch (type) {
        case 'left':
          r.x = minX;
          break;
        case 'right':
          r.x = maxX - r.width;
          break;
        case 'top':
          r.y = minY;
          break;
        case 'bottom':
          r.y = maxY - r.height;
          break;
        case 'centerH':
          r.x = (minX + maxX) / 2 - r.width / 2;
          break;
        case 'centerV':
          r.y = (minY + maxY) / 2 - r.height / 2;
          break;
        case 'distributeH': {
          const sorted = [...sel].sort((a, b) => a.data.rect.x - b.data.rect.x);
          const first = sorted[0].data.rect;
          const last = sorted[sorted.length - 1].data.rect;
          const span = last.x + last.width - first.x;
          const step = span / sorted.length;
          sorted.forEach((it, i) => {
            if (i === 0 || i === sorted.length - 1) return;
            it.data.rect.x = first.x + step * i;
          });
          break;
        }
        case 'distributeV': {
          const sorted = [...sel].sort((a, b) => a.data.rect.y - b.data.rect.y);
          const first = sorted[0].data.rect;
          const last = sorted[sorted.length - 1].data.rect;
          const span = last.y + last.height - first.y;
          const step = span / sorted.length;
          sorted.forEach((it, i) => {
            if (i === 0 || i === sorted.length - 1) return;
            it.data.rect.y = first.y + step * i;
          });
          break;
        }
      }
    }
    commit('align');
  }

  // -------------------------------------------------------------- 事件编排
  function makeAction(partial: Partial<EventAction> = {}): EventAction {
    return {
      id: uid('act'),
      type: (partial.type ?? ActionType.CALL_COMPONENT) as ActionType,
      targetId: partial.targetId,
      params: partial.params ?? {},
      condition: partial.condition,
      delay: partial.delay,
    };
  }

  function addEventBinding(sourceId: string, event: string, action?: Partial<EventAction>): string {
    const binding: EventBinding = {
      id: uid('ev'),
      sourceId,
      event,
      actions: action ? [makeAction(action)] : [],
      enabled: true,
    };
    page.value.events.push(binding);
    commit('event-add');
    return binding.id;
  }

  function updateEventBinding(id: string, patch: Partial<EventBinding>): void {
    const b = page.value.events.find((e) => e.id === id);
    if (b) Object.assign(b, patch);
    commit('event-upd');
  }

  function removeEventBinding(id: string): void {
    page.value.events = page.value.events.filter((e) => e.id !== id);
    commit('event-del');
  }

  function addEventAction(bindingId: string, action?: Partial<EventAction>): string {
    const b = page.value.events.find((e) => e.id === bindingId);
    if (!b) return '';
    const act = makeAction(action);
    b.actions.push(act);
    commit('action-add');
    return act.id;
  }

  function updateEventAction(bindingId: string, actionId: string, patch: Partial<EventAction>): void {
    const b = page.value.events.find((e) => e.id === bindingId);
    const act = b?.actions.find((a) => a.id === actionId);
    if (act) Object.assign(act, patch);
    commit('action-upd');
  }

  function removeEventAction(bindingId: string, actionId: string): void {
    const b = page.value.events.find((e) => e.id === bindingId);
    if (b) b.actions = b.actions.filter((a) => a.id !== actionId);
    commit('action-del');
  }

  function moveEventAction(bindingId: string, from: number, to: number): void {
    const b = page.value.events.find((e) => e.id === bindingId);
    if (!b) return;
    if (to < 0 || to >= b.actions.length) return;
    const [item] = b.actions.splice(from, 1);
    b.actions.splice(to, 0, item);
    commit('action-move');
  }

  // -------------------------------------------------------------- 选中/视图
  function selectNodes(ids: string[]): void {
    selectedIds.value = [...ids];
  }
  function clearSelection(): void {
    selectedIds.value = [];
  }

  function setActiveRightTab(tab: RightTab): void {
    activeRightTab.value = tab;
  }
  function toggleGrid(): void {
    showGrid.value = !showGrid.value;
  }
  function toggleRuler(): void {
    showRuler.value = !showRuler.value;
  }
  function setPreviewMode(v: boolean): void {
    previewMode.value = v;
  }

  function setCanvasScale(v: number): void {
    canvasScale.value = Math.min(4, Math.max(0.1, v));
  }
  function zoomIn(): void {
    setCanvasScale(Math.round((canvasScale.value + 0.1) * 10) / 10);
  }
  function zoomOut(): void {
    setCanvasScale(Math.round((canvasScale.value - 0.1) * 10) / 10);
  }
  function setCanvasOffset(x: number, y: number): void {
    canvasOffset.value = { x, y };
  }

  /** 适应屏幕：根据容器尺寸计算缩放并居中 */
  function fitScreen(containerWidth: number, containerHeight: number): void {
    const cw = engineConfig.value.canvas?.width ?? 1920;
    const ch = engineConfig.value.canvas?.height ?? 1080;
    if (!containerWidth || !containerHeight) return;
    const scale = Math.min(containerWidth / cw, containerHeight / ch) * 0.9;
    canvasScale.value = Math.min(4, Math.max(0.1, scale));
    canvasOffset.value = {
      x: (containerWidth - cw * canvasScale.value) / 2,
      y: (containerHeight - ch * canvasScale.value) / 2,
    };
  }

  /** 取当前相机视角写入引擎配置（属性面板「取当前视角」按钮调用） */
  function captureCameraView(view: {
    longitude: number;
    latitude: number;
    height: number;
    heading: number;
    pitch: number;
    roll: number;
  }): void {
    engineConfig.value.cesium.initialView = { ...view };
    commit('camera');
  }

  // -------------------------------------------------------------- 撤销重做
  function undo(): void {
    const snap = history.undo();
    if (snap) {
      applySnapshot(snap);
      dirty.value = true;
    }
  }
  function redo(): void {
    const snap = history.redo();
    if (snap) {
      applySnapshot(snap);
      dirty.value = true;
    }
  }
  function resetHistory(): void {
    history.reset(makeSnapshot());
  }

  // -------------------------------------------------------------- 自动保存
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  function startAutoSave(): void {
    if (autoSaveTimer) return;
    autoSaveTimer = setInterval(() => {
      if (dirty.value && autoSaveEnabled.value && sceneId.value && !saving.value) {
        void save();
      }
    }, 60000);
  }
  function stopAutoSave(): void {
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
  }

  // -------------------------------------------------------------- 离开守卫
  function beforeUnloadHandler(e: BeforeUnloadEvent): void {
    if (dirty.value) {
      e.preventDefault();
      e.returnValue = '';
    }
  }
  function installGuard(): void {
    window.addEventListener('beforeunload', beforeUnloadHandler);
  }
  function uninstallGuard(): void {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  }

  return {
    // 状态
    sceneId,
    sceneDetail,
    loading,
    saving,
    publishing,
    dirty,
    autoSaveEnabled,
    engineConfig,
    components,
    page,
    layers,
    componentCatalog,
    dataSources,
    modelAssets,
    perfStats,
    currentCamera,
    // 选中
    selectedIds,
    selectedNode,
    selectedWrappers,
    // 视图
    canvasScale,
    canvasOffset,
    showGrid,
    showRuler,
    previewMode,
    activeRightTab,
    // 历史
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    // 动作
    loadScene,
    save,
    publish,
    loadComponentCatalog,
    loadDataSources,
    loadModelAssets,
    getComponentItem,
    addWidget,
    add3DComponent,
    updateNode,
    removeNodes,
    duplicateNode,
    moveNode,
    updateComponent,
    commitDrag,
    reorderLayer,
    setLayerVisible,
    toggleNodeVisible,
    lockNode,
    alignNodes,
    addEventBinding,
    updateEventBinding,
    removeEventBinding,
    addEventAction,
    updateEventAction,
    removeEventAction,
    moveEventAction,
    selectNodes,
    clearSelection,
    setActiveRightTab,
    toggleGrid,
    toggleRuler,
    setPreviewMode,
    setCanvasScale,
    zoomIn,
    zoomOut,
    setCanvasOffset,
    fitScreen,
    captureCameraView,
    setCurrentCamera,
    undo,
    redo,
    resetHistory,
    startAutoSave,
    stopAutoSave,
    installGuard,
    uninstallGuard,
  };
});
