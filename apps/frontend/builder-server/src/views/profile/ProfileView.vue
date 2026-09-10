<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import IconBase from '@/components/ui/IconBase.vue';
import SpinnerBox from '@/components/ui/SpinnerBox.vue';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/useToast';
import { changePasswordApi } from '@/services/api/auth';
import { formatDateTime } from '@/utils/format';

const router = useRouter();
const auth = useAuthStore();
const toast = useToast();

const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const submitting = ref(false);

/** 密码强度：长度 + 字符种类 */
const strength = computed<{ level: number; text: string; color: string }>(() => {
  const p = pwdForm.newPassword;
  if (!p) return { level: 0, text: '未输入', color: '#d6dbe4' };
  let score = 0;
  if (p.length >= 6) score += 1;
  if (p.length >= 10) score += 1;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score += 1;
  if (/\d/.test(p)) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  if (score <= 2) return { level: 33, text: '弱', color: '#dc2626' };
  if (score <= 4) return { level: 66, text: '中', color: '#d97706' };
  return { level: 100, text: '强', color: '#0f9d76' };
});

async function submitPassword(): Promise<void> {
  if (!pwdForm.oldPassword) {
    toast.warning('请输入当前密码');
    return;
  }
  if (pwdForm.newPassword.length < 6) {
    toast.warning('新密码至少 6 位');
    return;
  }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    toast.warning('两次输入的新密码不一致');
    return;
  }
  submitting.value = true;
  try {
    await changePasswordApi({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    });
    toast.success('密码已修改，请重新登录');
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirmPassword = '';
    await auth.logout();
    await router.replace('/login');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '修改密码失败');
  } finally {
    submitting.value = false;
  }
}

const profile = computed(() => auth.profile);
/** UserProfile.roles 为角色编码数组，直接拼接展示 */
const roleNames = computed(() =>
  profile.value?.roles && profile.value.roles.length > 0 ? profile.value.roles.join('、') : '未分配角色',
);

onMounted(async () => {
  if (!profile.value) await auth.fetchProfile();
});
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="page-title">个人中心</h2>
        <p class="page-desc">查看账号信息并管理登录密码</p>
      </div>
    </header>

    <div v-if="auth.loading && !profile" class="state-box">
      <SpinnerBox size="lg" text="加载账号信息" />
    </div>

    <div v-else class="layout">
      <!-- 资料卡片 -->
      <section class="card profile-card">
        <div class="avatar-lg">{{ (profile?.realName || profile?.username || 'U').charAt(0).toUpperCase() }}</div>
        <h3 class="name">{{ profile?.realName || profile?.username }}</h3>
        <p class="sub">@{{ profile?.username }}</p>
        <div class="role-row">
          <IconBase name="user" :size="14" />
          <span>{{ roleNames }}</span>
        </div>
        <dl class="meta">
          <div class="meta-row">
            <dt>邮箱</dt>
            <dd>{{ profile?.email || '未填写' }}</dd>
          </div>
          <div class="meta-row">
            <dt>手机号</dt>
            <dd>{{ profile?.phone || '未填写' }}</dd>
          </div>
          <div class="meta-row">
            <dt>最后登录</dt>
            <dd>{{ formatDateTime(profile?.lastLoginAt) }}</dd>
          </div>
        </dl>
      </section>

      <!-- 修改密码 -->
      <section class="card pwd-card">
        <h3 class="card-title">修改密码</h3>
        <p class="card-desc">修改成功后当前登录态会失效，需要使用新密码重新登录。</p>

        <div class="form-stack">
          <label class="form-item">
            <span class="form-label required">当前密码</span>
            <BaseInput v-model="pwdForm.oldPassword" type="password" placeholder="请输入当前密码" />
          </label>

          <label class="form-item">
            <span class="form-label required">新密码</span>
            <BaseInput v-model="pwdForm.newPassword" type="password" placeholder="至少 6 位，建议包含大小写与数字" />
            <div class="strength">
              <div class="strength-bar">
                <div class="strength-inner" :style="{ width: `${strength.level}%`, background: strength.color }" />
              </div>
              <span class="strength-text" :style="{ color: strength.color }">{{ strength.text }}</span>
            </div>
          </label>

          <label class="form-item">
            <span class="form-label required">确认新密码</span>
            <BaseInput v-model="pwdForm.confirmPassword" type="password" placeholder="再次输入新密码" />
          </label>

          <div class="actions">
            <BaseButton
              type="primary"
              :loading="submitting"
              :disabled="!pwdForm.oldPassword || !pwdForm.newPassword"
              @click="void submitPassword()"
            >
              确认修改
            </BaseButton>
            <BaseButton
              @click="() => { pwdForm.oldPassword = ''; pwdForm.newPassword = ''; pwdForm.confirmPassword = ''; }"
            >
              清空
            </BaseButton>
          </div>
        </div>
      </section>
    </div>
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
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}
.layout {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 18px;
  align-items: start;
}
.card {
  background: #ffffff;
  border: 1px solid #e8ecf3;
  border-radius: 12px;
  padding: 22px 22px 20px;
}
.profile-card {
  text-align: center;
}
.avatar-lg {
  width: 68px;
  height: 68px;
  margin: 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 600;
  color: #ffffff;
  background: linear-gradient(135deg, #1677ff 0%, #13c2c2 100%);
}
.name {
  margin: 12px 0 2px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}
.sub {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
}
.role-row {
  margin: 12px 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  border-radius: 999px;
  background: #eaf2ff;
  color: #1677ff;
  font-size: 12.5px;
}
.meta {
  margin: 0;
  text-align: left;
  border-top: 1px solid #f0f3f8;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.meta-row {
  display: flex;
  gap: 10px;
  font-size: 13px;
}
.meta-row dt {
  width: 68px;
  flex-shrink: 0;
  color: #9ca3af;
}
.meta-row dd {
  margin: 0;
  color: #374151;
  word-break: break-all;
}
.pwd-card {
  max-width: 560px;
}
.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}
.card-desc {
  margin: 6px 0 18px;
  font-size: 12.5px;
  color: #9ca3af;
}
.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
.strength {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.strength-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: #eef2f7;
  overflow: hidden;
}
.strength-inner {
  height: 100%;
  transition: width 0.2s, background 0.2s;
}
.strength-text {
  font-size: 12px;
  width: 18px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 2px;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
