/**
 * 为 `?worker` 后缀导入提供类型声明。
 *
 * 本包刻意不依赖 vite 包：宿主应用（Vite）负责把 sandbox.worker.ts 打包成 Worker，
 * 这里只需要让 tsc 认识这种带查询串的模块 id。若消费方不是 Vite，
 * 可用 ScriptSandbox 的 workerFactory 注入自己的 Worker 构造。
 */
declare module '*?worker' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
