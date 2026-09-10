<script setup lang="ts">
import { computed } from 'vue';
import type { PermissionNode } from '@dt/shared-types';
import IconBase from '@/components/ui/IconBase.vue';

/**
 * 权限树递归节点
 * 父节点的勾选态由自身及全部后代叶子节点的勾选情况推导：
 * 全选 → checked，部分选中 → half（半选），未选 → unchecked。
 */
const props = withDefaults(
  defineProps<{
    node: PermissionNode;
    checkedIds: Set<string>;
    /** 层级深度，用于缩进 */
    depth?: number;
  }>(),
  { depth: 0 },
);

const emit = defineEmits<{ (e: 'toggle', node: PermissionNode): void }>();

const hasChildren = computed(() => Boolean(props.node.children && props.node.children.length > 0));

/** 当前节点下的全部叶子 id */
const leafIds = computed<string[]>(() => {
  const out: string[] = [];
  const walk = (list: PermissionNode[]): void => {
    list.forEach((n) => {
      if (n.children && n.children.length > 0) walk(n.children);
      else out.push(n.id);
    });
  };
  walk([props.node]);
  return out;
});

const checkedCount = computed(() => leafIds.value.filter((id) => props.checkedIds.has(id)).length);
const allChecked = computed(() => leafIds.value.length > 0 && checkedCount.value === leafIds.value.length);
const halfChecked = computed(() => checkedCount.value > 0 && checkedCount.value < leafIds.value.length);

/** 资源类型徽标文案 */
function resourceLabel(type: string): string {
  switch (type) {
    case 'MENU':
      return '菜单';
    case 'BUTTON':
      return '按钮';
    case 'API':
      return '接口';
    default:
      return type;
  }
}
</script>

<template>
  <div class="perm-node">
    <div class="perm-row" :style="{ paddingLeft: `${depth * 18}px` }" @click="emit('toggle', node)">
      <span class="checkbox" :class="{ checked: allChecked, half: halfChecked }">
        <IconBase v-if="allChecked" name="check" :size="11" />
        <span v-else-if="halfChecked" class="half-dot" />
      </span>
      <span class="perm-name">{{ node.permissionName }}</span>
      <span class="perm-code">{{ node.permissionCode }}</span>
      <span class="perm-type" :class="node.resourceType.toLowerCase()">{{ resourceLabel(node.resourceType) }}</span>
    </div>
    <template v-if="hasChildren">
      <PermissionTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :checked-ids="checkedIds"
        :depth="depth + 1"
        @toggle="emit('toggle', $event)"
      />
    </template>
  </div>
</template>

<script lang="ts">
// 递归组件需要显式名称，配合 <script setup> 时的自引用
export default { name: 'PermissionTreeNode' };
</script>

<style scoped>
.perm-node {
  user-select: none;
}
.perm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
}
.perm-row:hover {
  background: #f4f7fb;
}
.checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  color: #ffffff;
  background: #ffffff;
}
.checkbox.checked {
  background: #1677ff;
  border-color: #1677ff;
}
.checkbox.half {
  border-color: #1677ff;
}
.half-dot {
  width: 7px;
  height: 7px;
  border-radius: 1.5px;
  background: #1677ff;
}
.perm-name {
  font-weight: 500;
}
.perm-code {
  font-size: 12px;
  color: #9ca3af;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.perm-type {
  margin-left: auto;
  font-size: 11px;
  padding: 0 6px;
  border-radius: 4px;
  background: #f1f3f7;
  color: #6b7280;
}
.perm-type.menu {
  background: #eaf2ff;
  color: #1677ff;
}
.perm-type.button {
  background: #fff4e6;
  color: #d97706;
}
.perm-type.api {
  background: #e8f7f2;
  color: #0f9d76;
}
</style>
