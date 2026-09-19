/**
 * Stylelint 配置（迭代 4.3）。
 *
 * 分工原则：格式（缩进/分号/空行/引号）全部交给 Prettier，Stylelint 只管
 * 「写错会出 bug 或无效」的 CSS 语义问题（重复声明、未知属性、无效值、空块等），
 * 否则两个工具会互相覆写。因此只 extends recommended（不含格式规则），
 * 并把容易与存量代码打架、且不等于错误的命名类规则关掉。
 */
module.exports = {
  extends: ['stylelint-config-recommended', 'stylelint-config-recommended-vue'],
  rules: {
    // 存量代码尚未按命名规范收敛，命名类先不做强制（不是正确性问题）
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'keyframes-name-pattern': null,
    // 同名选择器顺序在 Vue scoped 样式里常有合理原因
    'no-descending-specificity': null,
    // Tailwind / PostCSS 插件自己的指令，不是未知 at-rule
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'apply',
          'variants',
          'responsive',
          'screen',
          'layer',
          'utility',
          'theme',
          'config',
          'reference',
        ],
      },
    ],
    // 允许 :deep()/::v-deep 之类的 Vue 穿透写法带来的解析差异
    'selector-pseudo-class-no-unknown': [
      true,
      { ignorePseudoClasses: ['deep', 'slotted', 'global'] },
    ],
    'selector-pseudo-element-no-unknown': [
      true,
      { ignorePseudoElements: ['v-deep', 'v-global', 'v-slotted'] },
    ],
  },
};
