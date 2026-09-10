<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';

const props = defineProps<{
  config?: Record<string, unknown>;
}>();

const c = computed(() => props.config ?? {});
const src = computed(() => (c.value.src as string) ?? '');
const poster = computed(() => (c.value.poster as string) ?? '');
const autoplay = computed(() => !!c.value.autoplay);
const muted = computed(() => c.value.muted !== false);
const videoRef = ref<HTMLVideoElement | null>(null);

// HLS（.m3u8）在原生不支持的浏览器需引入 hls.js；此处优先使用原生 video，
// 若需 HLS 可在主项目注入 hls.js 并监听 src 动态挂载。
const isHls = computed(() => /\.m3u8($|\?)/.test(src.value));

onBeforeUnmount(() => {
  const v = videoRef.value;
  if (v) {
    v.pause();
    v.removeAttribute('src');
    v.load();
  }
});
</script>

<template>
  <div class="dt-video">
    <video
      v-if="src"
      ref="videoRef"
      class="dt-video__el"
      :src="src"
      :poster="poster"
      :autoplay="autoplay"
      :muted="muted"
      controls
      playsinline
    ></video>
    <div v-else class="dt-video__placeholder">未配置视频源</div>
    <div v-if="src && isHls" class="dt-video__hint">HLS 需浏览器或 hls.js 支持</div>
  </div>
</template>

<style scoped>
.dt-video {
  width: 100%;
  height: 100%;
  position: relative;
  box-sizing: border-box;
  background: #000;
}
.dt-video__el {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}
.dt-video__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b89a8;
}
.dt-video__hint {
  position: absolute;
  left: 8px;
  bottom: 8px;
  font-size: 11px;
  color: #ffcc00;
  background: rgba(0, 0, 0, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
