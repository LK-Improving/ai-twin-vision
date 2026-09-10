import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  PAGE_DEFAULTS,
  type CloneSceneRequest,
  type CreateSceneRequest,
  type PublishSceneRequest,
  type PublishSceneResult,
  type SceneListItem,
  type SceneQuery,
} from '@dt/shared-types';
import {
  cloneSceneApi,
  createSceneApi,
  deleteSceneApi,
  getScenesApi,
  publishSceneApi,
} from '@/services/api/scene';
import { useToast } from '@/composables/useToast';

/**
 * 场景列表状态：分页查询、关键字/状态过滤、增删克隆发布。
 * 详情/编辑由 editor 同事的 stores/editor.ts 负责，本 store 只覆盖列表态。
 */
export const useSceneStore = defineStore('scene', () => {
  const list = ref<SceneListItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const keyword = ref('');
  const status = ref('');
  const page = ref(PAGE_DEFAULTS.page);
  const limit = ref(PAGE_DEFAULTS.limit);

  /** 拉取列表（根据当前 keyword / status / page 过滤） */
  async function fetchList(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const params: SceneQuery = {
        page: page.value,
        limit: limit.value,
        keyword: keyword.value || undefined,
        status: status.value || undefined,
      };
      const res = await getScenesApi(params);
      list.value = res.dataList;
      total.value = res.total;
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载场景列表失败';
      list.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  /** 新建场景并刷新列表 */
  async function create(data: CreateSceneRequest): Promise<SceneListItem | null> {
    const detail = await createSceneApi(data);
    await fetchList();
    return detail;
  }

  /** 删除场景 */
  async function remove(id: string): Promise<void> {
    await deleteSceneApi(id);
    useToast().success('场景已删除');
    await fetchList();
  }

  /** 克隆场景 */
  async function clone(data: CloneSceneRequest & { id: string }): Promise<void> {
    await cloneSceneApi(data.id, { name: data.name, description: data.description });
    useToast().success('场景已克隆');
    await fetchList();
  }

  /** 发布场景 */
  async function publish(id: string, data: PublishSceneRequest): Promise<PublishSceneResult> {
    const result = await publishSceneApi(id, data);
    useToast().success(`已发布 ${result.version}`);
    await fetchList();
    return result;
  }

  function setKeyword(value: string): void {
    keyword.value = value;
    page.value = 1;
  }

  function setStatus(value: string): void {
    status.value = value;
    page.value = 1;
  }

  function setPage(value: number): void {
    page.value = value;
  }

  function setLimit(value: number): void {
    limit.value = value;
    page.value = 1;
  }

  return {
    list,
    total,
    loading,
    error,
    keyword,
    status,
    page,
    limit,
    fetchList,
    create,
    remove,
    clone,
    publish,
    setKeyword,
    setStatus,
    setPage,
    setLimit,
  };
});
