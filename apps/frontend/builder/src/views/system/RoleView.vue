<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { CreateRoleRequest, PermissionNode, RoleItem } from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTable, { type TableColumn } from '@/components/ui/BaseTable.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import IconBase from '@/components/ui/IconBase.vue';
import PermissionTreeNode from './components/PermissionTreeNode.vue';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { createRoleApi, deleteRoleApi, getPermissionsApi, getRolesApi, updateRoleApi } from '@/services/api/system';
import { formatDateTime } from '@/utils/format';

const toast = useToast();
const { confirm } = useConfirm();

const loading = ref(false);
const error = ref<string | null>(null);
const roles = ref<RoleItem[]>([]);
const permissions = ref<PermissionNode[]>([]);

const columns: TableColumn[] = [
  { key: 'roleName', title: '角色名称' },
  { key: 'roleCode', title: '角色编码', width: 170 },
  { key: 'description', title: '描述' },
  { key: 'isSystem', title: '类型', width: 100, align: 'center' },
  { key: 'updatedAt', title: '更新时间', width: 170 },
  { key: 'actions', title: '操作', width: 130, align: 'center' },
];

/* ------------------------------ 权限树 ------------------------------ */

/** 已勾选的权限 id 集合（含父节点半选时的父 id 由提交前过滤） */
const checkedIds = ref<Set<string>>(new Set());

/** 收集所有叶子节点 id（只有叶子才是真正授权项） */
function collectLeafIds(nodes: PermissionNode[]): string[] {
  const out: string[] = [];
  const walk = (list: PermissionNode[]): void => {
    list.forEach((n) => {
      if (n.children && n.children.length > 0) walk(n.children);
      else out.push(n.id);
    });
  };
  walk(nodes);
  return out;
}

/** 点击节点：对自身及全部后代做全选/取消 */
function toggleNode(node: PermissionNode): void {
  const leaves = collectLeafIds([node]);
  const allChecked = leaves.length > 0 && leaves.every((id) => checkedIds.value.has(id));
  leaves.forEach((id) => {
    if (allChecked) checkedIds.value.delete(id);
    else checkedIds.value.add(id);
  });
  // 触发响应式更新
  checkedIds.value = new Set(checkedIds.value);
}

async function fetchData(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [roleList, permTree] = await Promise.all([getRolesApi(), getPermissionsApi()]);
    roles.value = roleList;
    permissions.value = permTree;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载角色数据失败';
    roles.value = [];
    permissions.value = [];
  } finally {
    loading.value = false;
  }
}

/* ------------------------------ 新建/编辑 ------------------------------ */

const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);

const form = reactive<CreateRoleRequest>({
  roleCode: '',
  roleName: '',
  description: '',
  permissionIds: [],
});

function openCreate(): void {
  editingId.value = null;
  form.roleCode = '';
  form.roleName = '';
  form.description = '';
  checkedIds.value = new Set();
  dialogVisible.value = true;
}

function openEdit(row: RoleItem): void {
  editingId.value = row.id;
  form.roleCode = row.roleCode;
  form.roleName = row.roleName;
  form.description = row.description ?? '';
  checkedIds.value = new Set(row.permissionIds ?? []);
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.roleCode.trim() || !form.roleName.trim()) {
    toast.warning('请填写角色编码与角色名称');
    return;
  }
  // 只提交叶子权限，父节点由后端按层级推导
  const leafSet = new Set(collectLeafIds(permissions.value));
  const permissionIds = Array.from(checkedIds.value).filter((id) => leafSet.has(id));
  saving.value = true;
  try {
    if (editingId.value) {
      await updateRoleApi(editingId.value, {
        roleCode: form.roleCode.trim(),
        roleName: form.roleName.trim(),
        description: form.description || undefined,
        permissionIds,
      });
      toast.success('角色已更新');
    } else {
      await createRoleApi({
        roleCode: form.roleCode.trim(),
        roleName: form.roleName.trim(),
        description: form.description || undefined,
        permissionIds,
      });
      toast.success('角色已创建');
    }
    dialogVisible.value = false;
    await fetchData();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: RoleItem): Promise<void> {
  if (row.isSystem) {
    toast.warning('系统内置角色不可删除');
    return;
  }
  const ok = await confirm({
    title: '删除角色',
    message: `确定删除角色「${row.roleName}」吗？拥有该角色的用户将失去对应权限。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteRoleApi(row.id);
    toast.success('角色已删除');
    await fetchData();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '删除失败');
  }
}

const showEmpty = computed(() => !loading.value && roles.value.length === 0);

onMounted(() => {
  void fetchData();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">角色权限</h2>
        <p class="page-desc">配置角色并为其分配菜单、按钮与接口权限</p>
      </div>
      <BaseButton type="primary" icon="plus" @click="openCreate">新建角色</BaseButton>
    </header>

    <div v-if="error" class="state-box">
      <EmptyState text="加载失败" :description="error" />
      <BaseButton class="mt-3" type="primary" @click="void fetchData()">重试</BaseButton>
    </div>

    <div v-else class="table-wrap">
      <BaseTable :columns="columns" :data="roles" :loading="loading" row-key="id">
        <template #cell-roleName="{ row }">
          <div class="cell-name">
            <IconBase name="user" :size="15" />
            <span>{{ (row as RoleItem).roleName }}</span>
          </div>
        </template>
        <template #cell-roleCode="{ row }">
          <span class="code">{{ (row as RoleItem).roleCode }}</span>
        </template>
        <template #cell-description="{ row }">
          <span>{{ (row as RoleItem).description || '-' }}</span>
        </template>
        <template #cell-isSystem="{ row }">
          <StatusBadge :type="(row as RoleItem).isSystem ? 'info' : 'default'" :text="(row as RoleItem).isSystem ? '内置' : '自定义'" />
        </template>
        <template #cell-updatedAt="{ row }">
          <span>{{ formatDateTime((row as RoleItem).updatedAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="ops">
            <button class="icon-btn" title="编辑权限" @click="openEdit(row as RoleItem)">
              <IconBase name="edit" :size="15" />
            </button>
            <button class="icon-btn danger" title="删除" @click="void onDelete(row as RoleItem)">
              <IconBase name="trash" :size="15" />
            </button>
          </div>
        </template>
      </BaseTable>

      <EmptyState v-if="showEmpty" text="暂无角色" description="新建角色后即可分配权限" />
    </div>

    <BaseModal
      :visible="dialogVisible"
      :title="editingId ? '编辑角色权限' : '新建角色'"
      width="620px"
      confirm-text="保存"
      :loading="saving"
      @update:visible="dialogVisible = $event"
      @confirm="void submit()"
    >
      <div class="form-stack">
        <div class="grid-2">
          <label class="form-item">
            <span class="form-label required">角色编码</span>
            <BaseInput v-model="form.roleCode" placeholder="例如：OPERATOR" :disabled="editingId !== null" />
          </label>
          <label class="form-item">
            <span class="form-label required">角色名称</span>
            <BaseInput v-model="form.roleName" placeholder="例如：运维人员" />
          </label>
        </div>
        <label class="form-item">
          <span class="form-label">角色描述</span>
          <BaseTextarea v-model="(form.description as string)" :rows="2" placeholder="描述该角色的职责范围" />
        </label>

        <div class="divider">权限分配</div>
        <div class="perm-tree">
          <PermissionTreeNode
            v-for="node in permissions"
            :key="node.id"
            :node="node"
            :checked-ids="checkedIds"
            @toggle="toggleNode"
          />
          <EmptyState v-if="permissions.length === 0" text="暂无可分配权限" />
        </div>
      </div>
    </BaseModal>
  </div>
</template>


<style scoped>
.page {
  padding: 24px 28px 32px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}
.page-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
}
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}
.table-wrap {
  margin-top: 18px;
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 12px;
  padding: 12px 14px 14px;
}
.cell-name {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1f2937;
}
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  color: #4b5563;
}
.ops {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #6b7280;
}
.icon-btn:hover {
  background: #f2f5fa;
  color: #1677ff;
}
.icon-btn.danger:hover {
  background: #fef2f2;
  color: #dc2626;
}
.form-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-item {
  display: block;
}
.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #4b5563;
}
.form-label.required::after {
  content: ' *';
  color: #dc2626;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.divider {
  font-size: 12px;
  color: #9ca3af;
  border-top: 1px solid #f0f3f8;
  padding-top: 12px;
}
.perm-tree {
  max-height: 320px;
  overflow: auto;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  padding: 8px 10px;
}
</style>
