import type { AlertRuleItem } from '@dt/shared-types';

/** 告警条件（与 @dt/shared-types AlertRuleItem.condition 一致） */
export type AlertCondition = AlertRuleItem['condition'];

/**
 * 纯函数：根据告警规则的条件、阈值与遥测值，判定是否触发告警。
 *
 * 从 AlertService.matches 抽取，便于独立单测（D 组 D1）。
 * 行为说明：
 * - 比较类运算符（> >= < <= == !=）依赖阈值：threshold 优先，缺省回落 condition.value；
 *   两者皆非有限数字则不触发；
 * - between / outside 依赖 condition.min / condition.max（缺省 ±Infinity），**不依赖 threshold**，
 *   因此即使 threshold 为 null 也能正常判定（修复原 matches 的阈值守卫误杀区间规则的 bug）；
 * - 未知运算符一律不触发。
 */
export function evaluateThreshold(
  condition: AlertCondition,
  threshold: number | null,
  value: number,
): boolean {
  const op = condition.operator;
  switch (op) {
    case '>':
    case '>=':
    case '<':
    case '<=':
    case '==':
    case '!=': {
      const t = threshold ?? condition.value;
      if (t === undefined || t === null || Number.isNaN(t)) return false;
      switch (op) {
        case '>':
          return value > t;
        case '>=':
          return value >= t;
        case '<':
          return value < t;
        case '<=':
          return value <= t;
        case '==':
          return value === t;
        case '!=':
          return value !== t;
        default:
          return false;
      }
    }
    case 'between':
      return value >= (condition.min ?? -Infinity) && value <= (condition.max ?? Infinity);
    case 'outside':
      return value < (condition.min ?? -Infinity) || value > (condition.max ?? Infinity);
    default:
      return false;
  }
}
