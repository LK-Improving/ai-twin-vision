import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { setupRequestAdapter } from './services/request';
import './styles/index.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

// 启用本地 Mock 适配器（VITE_USE_MOCK=true）
setupRequestAdapter();

/**
 * 全局运行时错误兜底层。
 * 组件渲染/生命周期中的未捕获错误默认只进 console，页面会静默空白，
 * 极难排查。这里把错误以红字浮层直接显示在页面底部，方便在浏览器里直接看到根因。
 */
function showErrorOverlay(err: unknown, info?: string): void {
  if (typeof document === 'undefined') return;
  let box = document.getElementById('__app_error_overlay__');
  if (!box) {
    box = document.createElement('div');
    box.id = '__app_error_overlay__';
    box.setAttribute(
      'style',
      [
        'position:fixed',
        'left:0',
        'right:0',
        'bottom:0',
        'z-index:99999',
        'max-height:45vh',
        'overflow:auto',
        'padding:12px 16px',
        'background:rgba(140,0,0,0.94)',
        'color:#fff',
        'font:12px/1.6 monospace',
        'white-space:pre-wrap',
        'box-shadow:0 -2px 12px rgba(0,0,0,0.45)',
      ].join(';'),
    );
    document.body.appendChild(box);
  }
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  box.textContent = `运行时错误（把这段贴给小k即可定位）：\n${info ?? ''}\n${msg}`;
}

app.config.errorHandler = (err, _instance, info) => {
  // eslint-disable-next-line no-console
  console.error('[global error]', err, info);
  showErrorOverlay(err, info);
};

window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledrejection]', e.reason);
  showErrorOverlay(e.reason, 'unhandledrejection');
});
window.addEventListener('error', (e) => {
  if (e.message) {
    // eslint-disable-next-line no-console
    console.error('[window error]', e.message);
    showErrorOverlay(e.message, 'window.error');
  }
});

app.mount('#app');
