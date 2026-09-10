/**
 * Conventional Commits 规范
 * 示例：feat(engine): 支持 Cesium 与 Three.js 相机同步
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // 缺陷修复
        'docs', // 文档变更
        'style', // 代码格式（不影响功能）
        'refactor', // 重构
        'perf', // 性能优化
        'test', // 测试相关
        'build', // 构建系统或依赖变更
        'ci', // CI 配置变更
        'chore', // 其他杂项
        'revert', // 回滚
      ],
    ],
    'scope-enum': [
      1,
      'always',
      [
        'engine', // packages/rendering-engine
        'widgets', // packages/widgets
        'shared', // packages/shared-types
        'web', // apps/frontend/builder-server
        'api', // apps/backend/widget-server
        'auth',
        'scene',
        'component',
        'data',
        'iot',
        'file',
        'infra',
        'deps',
        'release',
      ],
    ],
    'subject-max-length': [2, 'always', 100],
    'subject-case': [0],
  },
};
