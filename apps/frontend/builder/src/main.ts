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

app.mount('#app');
