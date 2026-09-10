<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const c = computed(() => props.config ?? {});
const title = computed(() => (c.value.title as string) ?? '');
const borderColor = computed(() => (c.value.borderColor as string) ?? '#00eaff');
const glow = computed(() => !!c.value.glow);
</script>

<template>
  <div
    class="dt-panel"
    :class="{ 'dt-panel--glow': glow }"
    :style="{ borderColor }"
  >
    <div v-if="title" class="dt-panel__title" :style="{ color: borderColor }">{{ title }}</div>
    <div class="dt-panel__body">
      <slot />
    </div>
    <span class="dt-panel__corner dt-panel__corner--tl" :style="{ borderColor }"></span>
    <span class="dt-panel__corner dt-panel__corner--tr" :style="{ borderColor }"></span>
    <span class="dt-panel__corner dt-panel__corner--bl" :style="{ borderColor }"></span>
    <span class="dt-panel__corner dt-panel__corner--br" :style="{ borderColor }"></span>
  </div>
</template>

<style scoped>
.dt-panel {
  width: 100%;
  height: 100%;
  position: relative;
  border: 1px solid;
  box-sizing: border-box;
  background: linear-gradient(180deg, rgba(0, 234, 255, 0.04), rgba(11, 18, 32, 0.4));
  padding: 8px;
}
.dt-panel--glow {
  box-shadow: 0 0 12px rgba(0, 234, 255, 0.25) inset;
}
.dt-panel__title {
  font-size: 14px;
  font-weight: bold;
  padding: 2px 6px 8px;
}
.dt-panel__body {
  width: 100%;
  height: calc(100% - 30px);
}
.dt-panel__corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-style: solid;
  border-width: 2px 0 0 2px;
}
.dt-panel__corner--tl {
  top: -1px;
  left: -1px;
}
.dt-panel__corner--tr {
  top: -1px;
  right: -1px;
  border-width: 2px 2px 0 0;
}
.dt-panel__corner--bl {
  bottom: -1px;
  left: -1px;
  border-width: 0 0 2px 2px;
}
.dt-panel__corner--br {
  bottom: -1px;
  right: -1px;
  border-width: 0 2px 2px 0;
}
</style>
