<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import { useToast } from '@/composables/useToast';
import { generateAiSceneApi, publishSceneApi } from '@/services/api/scene';
import type { GenerateSceneResult, AiSceneStrategy } from '@dt/shared-types';
import { SceneType } from '@dt/shared-types';

const props = withDefaults(defineProps<{ visible?: boolean }>(), { visible: false });
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'generated', sceneId: string): void;
}>();

const router = useRouter();
const toast = useToast();

const STRATEGY_OPTIONS: { value: AiSceneStrategy; label: string }[] = [
  { value: 'auto', label: '程序化生成（默认，零依赖）' },
  { value: 'text3d', label: '文生 3D · Tripo（已配置）' },
  { value: 'gaussianSplat', label: '3DGS 高斯泼溅（未配置将自动降级）' },
  { value: 'amapEarth', label: '高德 ABot-Earth（未配置将自动降级）' },
];

const form = reactive<{
  prompt: string;
  name: string;
  autoPublish: boolean;
  strategy: AiSceneStrategy;
}>({
  prompt: '',
  name: '',
  autoPublish: true,
  strategy: 'auto',
});
const loading = ref(false);
const publishing = ref(false);
const result = ref<GenerateSceneResult | null>(null);
const errorMsg = ref('');

/** 公开演示令牌：autoPublish 成功时由生成结果带回，否则由「发布为演示大屏」按钮补齐 */
const pubToken = ref('');
/** 公开演示大屏绝对地址（前端路由 /screen/:token，免登录） */
const screenUrl = computed(() =>
  pubToken.value ? `${window.location.origin}/screen/${pubToken.value}` : '',
);

const EXAMPLES = [
  '生成一个大型智慧产业园区，包含商业综合体、研发办公楼、学校和地铁站，夜晚灯光效果',
  '一个以住宅小区为主的社区，带雨雾天气，需要展示招商和环保指标',
  '工业制造园区，包含厂房、办公楼和医院，白天晴朗',
];

function reset(): void {
  form.prompt = '';
  form.name = '';
  form.autoPublish = true;
  form.strategy = 'auto';
  result.value = null;
  pubToken.value = '';
  errorMsg.value = '';
}

function close(): void {
  emit('update:visible', false);
}

async function onGenerate(): Promise<void> {
  if (!form.prompt.trim()) {
    toast.warning('请描述你想要的园区');
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await generateAiSceneApi({
      prompt: form.prompt.trim(),
      name: form.name.trim() || undefined,
      sceneType: SceneType.HYBRID,
      quality: 'L1',
      strategy: form.strategy,
      autoPublish: form.autoPublish,
    });
    result.value = res;
    if (res.publishToken) pubToken.value = res.publishToken;
    emit('generated', res.sceneId);
    toast.success(
      pubToken.value
        ? '场景已生成并发布为演示大屏，可直接打开公开链接'
        : '场景已生成，可在预览中查看三维模型与面板',
    );
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '生成失败';
    toast.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}

function openPreview(): void {
  if (result.value?.sceneId) window.open(`/preview/${result.value.sceneId}`, '_blank');
}
function openEditor(): void {
  if (result.value?.sceneId) void router.push(`/scenes/${result.value.sceneId}/edit`);
}

/** 一键发布为演示大屏：拿到公开令牌后即可免登录访问 /screen/:token */
async function onPublish(): Promise<void> {
  const id = result.value?.sceneId;
  if (!id) return;
  publishing.value = true;
  try {
    const pub = await publishSceneApi(id, { changeLog: 'AI 对话生成后一键发布' });
    if (pub.publishToken) {
      pubToken.value = pub.publishToken;
      toast.success('已发布为演示大屏');
    } else {
      toast.warning('发布成功，但未返回访问令牌');
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '发布失败');
  } finally {
    publishing.value = false;
  }
}

function openScreen(): void {
  if (screenUrl.value) window.open(screenUrl.value, '_blank');
}

async function copyLink(): Promise<void> {
  if (!screenUrl.value) return;
  try {
    await navigator.clipboard.writeText(screenUrl.value);
    toast.success('演示链接已复制');
  } catch {
    toast.warning('复制失败，请手动选中链接复制');
  }
}

function finish(): void {
  reset();
  close();
}
</script>

<template>
  <BaseModal
    :visible="visible"
    title="AI 对话生成园区"
    width="620px"
    :loading="loading"
    hide-footer
    @update:visible="emit('update:visible', $event)"
  >
    <!-- 未生成：输入区 -->
    <div v-if="!result" class="ai-form">
      <label class="form-label required">场景描述</label>
      <BaseTextarea
        v-model="form.prompt"
        :rows="4"
        :disabled="loading"
        placeholder="用一句话描述你想要的园区，例如：一个大型智慧产业园，包含商业综合体、办公楼、学校和地铁站，夜晚灯光"
      />
      <div class="examples">
        <span class="examples-label">示例：</span>
        <button
          v-for="(ex, i) in EXAMPLES"
          :key="i"
          type="button"
          class="example-chip"
          :disabled="loading"
          @click="form.prompt = ex"
        >
          {{ ex.slice(0, 16) }}…
        </button>
      </div>

      <label class="form-label mt-3">场景名称（可选）</label>
      <BaseInput
        v-model="form.name"
        :disabled="loading"
        placeholder="留空则自动命名"
        :maxlength="50"
      />

      <label class="form-label mt-3">生成方式</label>
      <select v-model="form.strategy" class="form-select" :disabled="loading">
        <option v-for="opt in STRATEGY_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>

      <label class="switch-row mt-3">
        <input v-model="form.autoPublish" type="checkbox" :disabled="loading" />
        <span>生成后立即发布为演示大屏（生成免登录公开链接，可直接投屏 / 分享）</span>
      </label>

      <p v-if="errorMsg" class="err-tip">{{ errorMsg }}</p>

      <div class="hint">
        生成的内容包含：白模城市三维模型（GLB）+ 倾斜/POI 标注 + 顶部 KPI / 图表 / 告警大屏面板。
      </div>
    </div>

    <!-- 已生成：结果区 -->
    <div v-else class="ai-result">
      <div class="ok-banner">
        <span class="ok-dot" />
        场景生成成功
      </div>

      <div v-if="result.warnings.length" class="warn-box">
        <strong>提示：</strong>
        <ul>
          <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <div class="stat-grid">
        <div class="stat-cell">
          <span class="stat-num">{{ result.stats.buildings }}</span>
          <span class="stat-cap">建筑</span>
        </div>
        <div class="stat-cell">
          <span class="stat-num">{{ result.stats.pois }}</span>
          <span class="stat-cap">POI 标注</span>
        </div>
        <div class="stat-cell">
          <span class="stat-num">{{ result.stats.triangles.toLocaleString() }}</span>
          <span class="stat-cap">三角面</span>
        </div>
        <div class="stat-cell">
          <span class="stat-num">{{ (result.stats.bytes / 1024).toFixed(0) }}KB</span>
          <span class="stat-cap">模型体积</span>
        </div>
        <div class="stat-cell">
          <span class="stat-num">{{ result.stats.elapsedMs }}ms</span>
          <span class="stat-cap">耗时</span>
        </div>
      </div>

      <p class="scene-id">
        场景 ID：
        <code>{{ result.sceneId }}</code>
      </p>

      <!-- 已发布：展示公开演示链接 -->
      <div v-if="pubToken" class="pub-box ok">
        <div class="pub-title">
          <span class="pub-dot" />
          已发布为演示大屏
        </div>
        <code class="pub-link">{{ screenUrl }}</code>
        <div class="pub-ops">
          <button type="button" class="btn-mini" @click="void copyLink()">复制链接</button>
          <button type="button" class="btn-mini primary" @click="openScreen">打开演示大屏</button>
        </div>
        <p class="pub-hint">免登录可访问，适合投屏与客户分享；再次发布后该链接保持不变。</p>
      </div>

      <!-- 未发布：一键补发 -->
      <div v-else class="pub-box pending">
        <div class="pub-title">尚未发布为演示大屏</div>
        <p class="pub-hint">发布后会生成免登录公开链接，可直接投屏或分享给客户。</p>
        <button type="button" class="btn-sub sm" :disabled="publishing" @click="void onPublish()">
          <span v-if="publishing" class="spinner dark" />
          发布为演示大屏
        </button>
      </div>
    </div>

    <!-- 底部操作 -->
    <template #footer>
      <button v-if="!result" type="button" class="btn-ghost" :disabled="loading" @click="close">
        取消
      </button>
      <button
        v-if="!result"
        type="button"
        class="btn-primary"
        :disabled="loading"
        @click="void onGenerate()"
      >
        <span v-if="loading" class="spinner" />
        生成场景
      </button>

      <template v-else>
        <button type="button" class="btn-ghost" @click="finish">完成</button>
        <button type="button" class="btn-sub" @click="openEditor">进入编辑器</button>
        <button type="button" class="btn-sub" @click="openPreview">打开预览</button>
        <button v-if="pubToken" type="button" class="btn-primary" @click="openScreen">
          打开演示大屏
        </button>
        <button
          v-else
          type="button"
          class="btn-primary"
          :disabled="publishing"
          @click="void onPublish()"
        >
          <span v-if="publishing" class="spinner" />
          发布为演示大屏
        </button>
      </template>
    </template>
  </BaseModal>
</template>

<style scoped>
.ai-form {
  display: flex;
  flex-direction: column;
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
.mt-3 {
  margin-top: 14px;
}
.form-select {
  height: 36px;
  border: 1px solid #e5e9f0;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  cursor: pointer;
}
.form-select:focus {
  border-color: #1677ff;
  outline: none;
}
.examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.examples-label {
  font-size: 12px;
  color: #9ca3af;
}
.example-chip {
  font-size: 12px;
  color: #1677ff;
  background: #eef4ff;
  border: 1px solid #dbe7ff;
  border-radius: 999px;
  padding: 3px 10px;
  cursor: pointer;
}
.example-chip:hover {
  background: #e2ecff;
}
.hint {
  margin-top: 14px;
  font-size: 12px;
  line-height: 1.7;
  color: #9ca3af;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  padding: 10px 12px;
}
.err-tip {
  margin: 10px 0 0;
  font-size: 13px;
  color: #dc2626;
}
.ai-result {
  display: flex;
  flex-direction: column;
}
.ok-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #16a34a;
}
.ok-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.18);
}
.warn-box {
  margin-top: 12px;
  font-size: 12.5px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 10px 12px;
}
.warn-box ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.stat-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.stat-cell {
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 12px 6px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-num {
  font-size: 18px;
  font-weight: 700;
  color: #1677ff;
}
.stat-cap {
  font-size: 11.5px;
  color: #6b7280;
}
.scene-id {
  margin: 14px 0 0;
  font-size: 12.5px;
  color: #6b7280;
}
.scene-id code {
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
  color: #334155;
}
.btn-ghost {
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid #e5e9f0;
  background: #fff;
  color: #374151;
  font-size: 13px;
  cursor: pointer;
}
.btn-ghost:hover {
  background: #f3f5f9;
}
.btn-sub {
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
  background: #fff;
  color: #1677ff;
  font-size: 13px;
  cursor: pointer;
}
.btn-sub:hover {
  background: #eff5ff;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 96px;
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  border: none;
  background: #1677ff;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.btn-primary:hover {
  background: #0f63e6;
}
.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  border-top-color: transparent;
  animation: spin 0.7s linear infinite;
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  user-select: none;
}
.switch-row input {
  width: 15px;
  height: 15px;
  accent-color: #1677ff;
  cursor: pointer;
}
.pub-box {
  margin-top: 14px;
  border-radius: 10px;
  padding: 12px 14px;
  border: 1px solid #e5e9f0;
  background: #f8fafc;
}
.pub-box.ok {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.pub-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: #15803d;
}
.pub-box.pending .pub-title {
  color: #475569;
}
.pub-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.18);
}
.pub-link {
  display: block;
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  background: #fff;
  border: 1px dashed #86efac;
  color: #166534;
  font-size: 12.5px;
  word-break: break-all;
}
.pub-ops {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.btn-mini {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  font-size: 12.5px;
  cursor: pointer;
}
.btn-mini:hover {
  background: #f3f5f9;
}
.btn-mini.primary {
  border-color: #1677ff;
  background: #1677ff;
  color: #fff;
}
.btn-mini.primary:hover {
  background: #0f63e6;
}
.pub-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #6b7280;
}
.btn-sub.sm {
  height: 32px;
  margin-top: 10px;
  font-size: 12.5px;
}
.spinner.dark {
  border-color: #1677ff;
  border-top-color: transparent;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
