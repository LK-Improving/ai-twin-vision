import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { BizCode, resolveBizMessage, type ApiResponse, type TokenPair } from '@dt/shared-types';
import {
  clearAuth,
  getAccessToken,
  getDeviceId,
  getRefreshToken,
  setTokens,
} from '@/utils/storage';
import { useToast } from '@/composables/useToast';
import { createMockAdapter } from '@/services/mock';

/**
 * 业务错误：携带后端业务码，便于调用方按 code 分支。
 */
export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const instance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
});

/* ---------------- 请求拦截：注入令牌与设备指纹 ---------------- */
instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  config.headers = config.headers ?? {};
  if (token) {
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  (config.headers as Record<string, string>)['X-Device-Id'] = getDeviceId();
  return config;
});

/* ---------------- 无感续期（单例 refreshing Promise + 重放） ---------------- */
let refreshing: Promise<boolean> | null = null;

function isRefreshRequest(config?: InternalAxiosRequestConfig): boolean {
  return config?.url?.includes('/auth/refresh') ?? false;
}

function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  const deviceId = getDeviceId();
  // 直连实例，绕过解包包装；响应拦截会把 ApiResponse 解包为 TokenPair
  return (
    instance.post('/auth/refresh', { refreshToken, deviceId }) as unknown as Promise<TokenPair>
  ).then((pair) => {
    setTokens({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
    });
    return true;
  });
}

function redirectLogin(): void {
  clearAuth();
  const current = window.location.pathname + window.location.search;
  if (!current.includes('/login')) {
    window.location.href = `/login?redirect=${encodeURIComponent(current)}`;
  }
}

function toApiError(error: AxiosError<ApiResponse>): ApiError {
  const body = error.response?.data;
  if (body && typeof body === 'object' && 'code' in body) {
    const code = body.code;
    const message = body.message || resolveBizMessage(code);
    return new ApiError(code, message);
  }
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message)) {
    return new ApiError(BizCode.INTERNAL_ERROR, '请求超时，请稍后重试');
  }
  if (!error.response) {
    return new ApiError(BizCode.INTERNAL_ERROR, '网络异常，无法连接服务器');
  }
  return new ApiError(error.response.status, error.response.statusText || '请求失败');
}

function showErrorToast(code: number, message: string): void {
  const toast = useToast();
  if (code === BizCode.FORBIDDEN) {
    toast.warning('权限不足，请联系管理员');
  } else if (code >= 500) {
    toast.error('服务器开小差了，请稍后重试');
  } else {
    toast.error(message || '操作失败');
  }
}

/* ---------------- 响应拦截：解包 + 错误归一 ---------------- */
instance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const body = response.data;
    // 标准 ApiResponse：成功解包 data，业务错误 reject
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === BizCode.SUCCESS) {
        return body.data as unknown as AxiosResponse;
      }
      const message = resolveBizMessage(body.code, body.message || '操作失败');
      showErrorToast(body.code, message);
      return Promise.reject(new ApiError(body.code, message));
    }
    // 非标准响应原样透传
    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status;
    const config = error.config as InternalAxiosRequestConfig | undefined;

    // 401 无感续期（刷新接口自身 401 不再重试）
    if (status === 401 && config && !isRefreshRequest(config)) {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        redirectLogin();
        return Promise.reject(toApiError(error));
      }
      if (!refreshing) {
        refreshing = doRefresh().catch((e) => {
          refreshing = null;
          redirectLogin();
          throw e;
        });
      }
      return refreshing.then(() => {
        const token = getAccessToken();
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        // 标记重试，避免刷新接口再次触发续期
        (config.headers as Record<string, string>)['X-Retry'] = '1';
        return instance(config);
      }) as Promise<never>;
    }

    const apiError = toApiError(error);
    showErrorToast(apiError.code, apiError.message);
    return Promise.reject(apiError);
  },
);

/* ---------------- 统一封装（业务层直接拿到 data，类型即 T） ---------------- */
export const http = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return instance.get(url, config) as unknown as Promise<T>;
  },
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.post(url, data, config) as unknown as Promise<T>;
  },
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.put(url, data, config) as unknown as Promise<T>;
  },
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return instance.patch(url, data, config) as unknown as Promise<T>;
  },
  del<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return instance.delete(url, config) as unknown as Promise<T>;
  },
  /**
   * 文件上传：支持进度回调。
   * @param onProgress 0-100 百分比
   */
  upload<T = unknown>(
    url: string,
    formData: FormData,
    options?: {
      onProgress?: (percent: number) => void;
      method?: 'post' | 'put';
      config?: AxiosRequestConfig;
    },
  ): Promise<T> {
    const method = options?.method ?? 'post';
    const reqConfig: AxiosRequestConfig = {
      url,
      method,
      data: formData,
      headers: {
        ...(options?.config?.headers ?? {}),
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (e) => {
        if (options?.onProgress && e.total) {
          options.onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    };
    return instance(reqConfig) as unknown as Promise<T>;
  },
};

/** 在启用 Mock 时安装本地适配器（main.ts 调用） */
export function setupRequestAdapter(): void {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    instance.defaults.adapter = createMockAdapter();
  }
}
