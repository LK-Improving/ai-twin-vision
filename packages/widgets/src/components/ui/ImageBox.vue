<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const c = computed(() => props.config ?? {});
const src = computed(() => (c.value.src as string) ?? '');
type ObjectFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
const fit = computed<ObjectFit>(() => ((c.value.fit as ObjectFit) ?? 'cover'));
const radius = computed(() => `${(c.value.radius as number) ?? 0}px`);
</script>

<template>
  <div class="dt-image" :style="{ borderRadius: radius }">
    <img v-if="src" :src="src" :style="{ objectFit: fit }" alt="" />
    <div v-else class="dt-image__placeholder">未配置图片</div>
  </div>
</template>

<style scoped>
.dt-image {
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.dt-image img {
  width: 100%;
  height: 100%;
  display: block;
}
.dt-image__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b89a8;
  background: rgba(255, 255, 255, 0.03);
}
</style>
