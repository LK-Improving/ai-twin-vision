import { evaluateThreshold } from './alert-evaluator';
import type { AlertRuleItem } from '@dt/shared-types';

type Op = AlertRuleItem['condition']['operator'];
const cond = (
  operator: Op,
  extra: Partial<AlertRuleItem['condition']> = {},
): AlertRuleItem['condition'] => ({
  operator,
  ...extra,
});

describe('evaluateThreshold', () => {
  describe('比较运算符', () => {
    it('> 命中 / 边界不命中 / 不命中', () => {
      expect(evaluateThreshold(cond('>'), 80, 81)).toBe(true);
      expect(evaluateThreshold(cond('>'), 80, 80)).toBe(false); // 不含边界
      expect(evaluateThreshold(cond('>'), 80, 79)).toBe(false);
    });

    it('>= 含边界', () => {
      expect(evaluateThreshold(cond('>='), 80, 80)).toBe(true);
      expect(evaluateThreshold(cond('>='), 80, 79)).toBe(false);
    });

    it('< 不含边界', () => {
      expect(evaluateThreshold(cond('<'), 80, 79)).toBe(true);
      expect(evaluateThreshold(cond('<'), 80, 80)).toBe(false);
    });

    it('<= 含边界', () => {
      expect(evaluateThreshold(cond('<='), 80, 80)).toBe(true);
      expect(evaluateThreshold(cond('<='), 80, 81)).toBe(false);
    });

    it('== 数值相等', () => {
      expect(evaluateThreshold(cond('=='), 80, 80)).toBe(true);
      expect(evaluateThreshold(cond('=='), 80, 80.0)).toBe(true);
      expect(evaluateThreshold(cond('=='), 80, 81)).toBe(false);
    });

    it('!= 不等', () => {
      expect(evaluateThreshold(cond('!='), 80, 81)).toBe(true);
      expect(evaluateThreshold(cond('!='), 80, 80)).toBe(false);
    });
  });

  describe('区间运算符', () => {
    it('between 含端点', () => {
      const c = cond('between', { min: 60, max: 90 });
      expect(evaluateThreshold(c, null, 60)).toBe(true); // 下界
      expect(evaluateThreshold(c, null, 90)).toBe(true); // 上界
      expect(evaluateThreshold(c, null, 75)).toBe(true);
      expect(evaluateThreshold(c, null, 59)).toBe(false);
      expect(evaluateThreshold(c, null, 91)).toBe(false);
    });

    it('outside 越界（含端点外）', () => {
      const c = cond('outside', { min: 60, max: 90 });
      expect(evaluateThreshold(c, null, 59)).toBe(true);
      expect(evaluateThreshold(c, null, 91)).toBe(true);
      expect(evaluateThreshold(c, null, 60)).toBe(false); // 端点内不算越界
      expect(evaluateThreshold(c, null, 75)).toBe(false);
    });

    it('between / outside 缺省边界退化为 ±Infinity', () => {
      expect(evaluateThreshold(cond('between'), null, 1e9)).toBe(true);
      expect(evaluateThreshold(cond('outside'), null, 1e9)).toBe(false);
    });
  });

  describe('阈值来源与异常', () => {
    it('threshold 优先于 condition.value', () => {
      // 显式阈值 80 应覆盖 value 70
      expect(evaluateThreshold(cond('>', { value: 70 }), 80, 75)).toBe(false);
      expect(evaluateThreshold(cond('>', { value: 70 }), 80, 85)).toBe(true);
    });

    it('threshold 为 null 时回落 condition.value', () => {
      expect(evaluateThreshold(cond('>', { value: 80 }), null, 85)).toBe(true);
      expect(evaluateThreshold(cond('>', { value: 80 }), null, 75)).toBe(false);
    });

    it('阈值非有限数字（NaN / undefined）不触发', () => {
      expect(evaluateThreshold(cond('>', { value: NaN }), null, 100)).toBe(false);
      expect(evaluateThreshold(cond('>'), null, 100)).toBe(false);
    });

    it('未知运算符不触发', () => {
      // @ts-expect-error 故意传入不在联合类型内的运算符
      expect(evaluateThreshold(cond('contains'), 80, 100)).toBe(false);
    });
  });
});
