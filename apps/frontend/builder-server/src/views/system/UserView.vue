<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { CreateUserRequest, RoleItem, UserItem, UserQuery } from '@dt/shared-types';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseSelect from '@/components/ui/BaseSelect.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTable, { type TableColumn } from '@/components/ui/BaseTable.vue';
import BasePagination from '@/components/ui/BasePagination.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import IconBase from '@/components/ui/IconBase.vue';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import { usePagination } from '@/composables/usePagination';
import { createUserApi, deleteUserApi, getRolesApi, getUsersApi, updateUserApi } from '@/services/api/system';
import { formatDateTime } from '@/utils/format';

const toast = useToast();
const { confirm } = useConfirm();
const { page, limit, total, onChangePage, onChangeLimit } = usePagination({ limit: 20 });

const loading = ref(false);
const error = ref<string | null>(null);
const list = ref<UserItem[]>([]);
const roles = ref<RoleItem[]>([]);
const filterStatus = ref<number | null>(null);

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '启用', value: '1' },
  { label: '禁用', value: '0' },
];

const roleOptions = computed(() => roles.value.map((r) => ({ label: r.roleName, value: r.id })));

const columns: TableColumn[] = [
  { key: 'username', title: '用户名' },
  { key: 'realName', title: '姓名', width: 130 },
  { key: 'roles', title: '角色', width: 180 },
  { key: 'email', title: '邮箱', width: 200 },
  { key: 'status', title: '状态', width: 90, align: 'center' },
  { key: 'lastLoginAt', title: '最后登录', width: 170 },
  { key: 'actions', title: '操作', width: 130, align: 'center' },
];

async function fetchRoles(): Promise<void> {
  try {
    roles.value = await getRolesApi();
  } catch {
    roles.value = [];
  }
}

async function fetchList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const params: UserQuery = {
      page: page.value,
      limit: limit.value,
      status: filterStatus.value ?? undefined,
    };
    const res = await getUsersApi(params);
    list.value = res.dataList;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载用户失败';
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

/* ------------------------------ 新建/编辑 ------------------------------ */

const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);

const form = reactive<CreateUserRequest>({
  username: '',
  password: '',
  realName: '',
  email: '',
  phone: '',
  status: 1,
  roleIds: [],
});

function openCreate(): void {
  editingId.value = null;
  Object.assign(form, {
    username: '',
    password: '',
    realName: '',
    email: '',
    phone: '',
    status: 1,
    roleIds: [] as string[],
  });
  dialogVisible.value = true;
}

function openEdit(row: UserItem): void {
  editingId.value = row.id;
  Object.assign(form, {
    username: row.username,
    password: '',
    realName: row.realName ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    status: row.status,
    roleIds: row.roles.map((r) => r.id),
  });
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!form.username.trim()) {
    toast.warning('请输入用户名');
    return;
  }
  if (!editingId.value && form.password.length < 6) {
    toast.warning('新建用户时密码至少 6 位');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      const { password: _omit, ...rest } = form;
      await updateUserApi(editingId.value, {
        ...rest,
        realName: rest.realName || undefined,
        email: rest.email || undefined,
        phone: rest.phone || undefined,
      });
      toast.success('用户已更新');
    } else {
      await createUserApi({
        ...form,
        realName: form.realName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      });
      toast.success('用户已创建');
    }
    dialogVisible.value = false;
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: UserItem): Promise<void> {
  const ok = await confirm({
    title: '删除用户',
    message: `确定删除用户「${row.username}」吗？`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteUserApi(row.id);
    toast.success('用户已删除');
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '删除失败');
  }
}

async function toggleStatus(row: UserItem): Promise<void> {
  try {
    await updateUserApi(row.id, { status: row.status === 1 ? 0 : 1 });
    toast.success(row.status === 1 ? '已禁用' : '已启用');
    await fetchList();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '操作失败');
  }
}

const showEmpty = computed(() => !loading.value && list.value.length === 0);

function roleNames(row: UserItem): string {
  return row.roles.length > 0 ? row.roles.map((r) => r.roleName).join('、') : '未分配';
}

onMounted(async () => {
  await fetchRoles();
  await fetchList();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">用户管理</h2>
        <p class="page-desc">维护平台账号、角色分配与启用状态</p>
      </div>
      <BaseButton type="primary" icon="plus" @click="openCreate">新建用户</BaseButton>
    </header>

    <div class="toolbar">
      <div class="w-40">
        <BaseSelect
          :model-value="filterStatus === null ? '' : String(filterStatus)"
          :options="statusOptions"
          @update:model-value="(v) => { filterStatus = v === '' || v === null ? null : Number(v); page = 1; void fetchList(); }"
        />
      </div>
      <div class="flex-1" />
      <BaseButton icon="refresh" @click="void fetchList()">刷新</BaseButton>
    </div>

    <div v-if="error" class="state-box">
      <EmptyState text="加载失败" :description="error" />
      <BaseButton class="mt-3" type="primary" @click="void fetchList()">重试</BaseButton>
    </div>

    <div v-else class="table-wrap">
      <BaseTable :columns="columns" :data="list" :loading="loading" row-key="id">
        <template #cell-username="{ row }">
          <div class="cell-name">
            <span class="avatar">{{ (row as UserItem).username.charAt(0).toUpperCase() }}</span>
            <span>{{ (row as UserItem).username }}</span>
          </div>
        </template>
        <template #cell-roles="{ row }">
          <span class="role-text">{{ roleNames(row as UserItem) }}</span>
        </template>
        <template #cell-email="{ row }">
          <span>{{ (row as UserItem).email || '-' }}</span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :type="(row as UserItem).status === 1 ? 'success' : 'default'" :text="(row as UserItem).status === 1 ? '启用' : '禁用'" />
        </template>
        <template #cell-lastLoginAt="{ row }">
          <span>{{ formatDateTime((row as UserItem).lastLoginAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="ops">
            <button class="icon-btn" title="编辑" @click="openEdit(row as UserItem)">
              <IconBase name="edit" :size="15" />
            </button>
            <button class="icon-btn" :title="(row as UserItem).status === 1 ? '禁用' : '启用'" @click="void toggleStatus(row as UserItem)">
              <IconBase :name="(row as UserItem).status === 1 ? 'lock' : 'unlock'" :size="15" />
            </button>
            <button class="icon-btn danger" title="删除" @click="void onDelete(row as UserItem)">
              <IconBase name="trash" :size="15" />
            </button>
          </div>
        </template>
      </BaseTable>

      <EmptyState v-if="showEmpty" text="暂无用户" description="调整筛选条件或新建用户" />

      <div class="mt-4 flex justify-end">
        <BasePagination
          :page="page"
          :limit="limit"
          :total="total"
          @update:page="(v) => { onChangePage(v); void fetchList(); }"
          @update:limit="(v) => { onChangeLimit(v); void fetchList(); }"
        />
      </div>
    </div>

    <BaseModal
      :visible="dialogVisible"
      :title="editingId ? '编辑用户' : '新建用户'"
      width="520px"
      confirm-text="保存"
      :loading="saving"
      @update:visible="dialogVisible = $event"
      @confirm="void submit()"
    >
      <div class="form-stack">
        <label class="form-item">
          <span class="form-label required">用户名</span>
          <BaseInput v-model="form.username" :disabled="editingId !== null" placeholder="登录账号" />
        </label>
        <label v-if="!editingId" class="form-item">
          <span class="form-label required">密码</span>
          <BaseInput v-model="form.password" type="password" placeholder="至少 6 位" />
        </label>
        <div class="grid-2">
          <label class="form-item">
            <span class="form-label">姓名</span>
            <BaseInput v-model="(form.realName as string)" placeholder="真实姓名" />
          </label>
          <label class="form-item">
            <span class="form-label">手机号</span>
            <BaseInput v-model="(form.phone as string)" placeholder="选填" />
          </label>
        </div>
        <label class="form-item">
          <span class="form-label">邮箱</span>
          <BaseInput v-model="(form.email as string)" placeholder="选填" />
        </label>
        <div class="form-item">
          <span class="form-label">角色</span>
          <BaseSelect
            :model-value="form.roleIds?.[0] ?? ''"
            :options="[{ label: '不分配', value: '' }, ...roleOptions]"
            @update:model-value="form.roleIds = $event ? [String($event)] : []"
          />
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
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 12px;
}
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}
.table-wrap {
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
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #eaf2ff;
  color: #1677ff;
  font-size: 12px;
  font-weight: 600;
}
.role-text {
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
</style>
