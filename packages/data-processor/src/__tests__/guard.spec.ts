import { describe, expect, it } from 'vitest';
import { formatGuardIssues, scanScript, stripLiterals } from '../guard';

const reasons = (code: string): string => formatGuardIssues(scanScript(code));

describe('sandbox/guard 静态守卫', () => {
  it('放行常规数据转换脚本', () => {
    const script = `
      const list = (data && data.list) || [];
      return list.filter(i => i.value > 0).map(i => ({ name: i.label, value: i.value * 100 }));
    `;
    expect(scanScript(script)).toEqual([]);
  });

  it.each([
    ['window', 'return window.location.href;'],
    ['document', 'document.cookie = "a=1"; return data;'],
    ['fetch', 'return fetch("/api/v1/users").then(r => r.json());'],
    ['localStorage', 'return localStorage.getItem("token");'],
    ['原型链逃逸', 'return "".constructor.constructor("return this")();'],
    ['动态代码', 'return Function("return 1")();'],
    ['次级上下文', 'return new Worker("/evil.js");'],
  ])('拒绝包含 %s 的脚本并给出原因', (_name, code) => {
    expect(reasons(code)).not.toBe('');
  });

  it('字符串与注释中的敏感词不误报', () => {
    const code = `
      // 提示：这里不能访问 window 与 document
      /* fetch 也不可用 */
      const tip = "请查看 window 文档";
      return { tip, ok: true };
    `;
    expect(scanScript(code)).toEqual([]);
  });

  it('stripLiterals 抹除字面量但保留结构', () => {
    const stripped = stripLiterals('const a = "x window"; // document\nreturn a;');
    expect(stripped).not.toContain('window');
    expect(stripped).not.toContain('document');
    expect(stripped).toContain('return a;');
  });

  it('空脚本直接放行（上层按无需执行处理）', () => {
    expect(scanScript('   ')).toEqual([]);
  });
});
