import { parseTelemetryPayload, topicToRegExp } from './driver';

describe('parseTelemetryPayload', () => {
  it('解析平台标准格式（含 deviceCode + properties + ISO timestamp）', () => {
    const raw = JSON.stringify({
      deviceCode: 'TRANS-001',
      properties: { temperature: 65.2, load: 71.3 },
      timestamp: '2026-09-11T08:00:00.000Z',
    });
    expect(parseTelemetryPayload(raw)).toEqual([
      { propertyCode: 'temperature', value: 65.2, timestamp: '2026-09-11T08:00:00.000Z' },
      { propertyCode: 'load', value: 71.3, timestamp: '2026-09-11T08:00:00.000Z' },
    ]);
  });

  it('解析无 deviceCode 的 properties 表（格式 2）', () => {
    const raw = JSON.stringify({ properties: { humidity: 42 } });
    expect(parseTelemetryPayload(raw)).toEqual([{ propertyCode: 'humidity', value: 42 }]);
  });

  it('解析单点格式（propertyCode + value）', () => {
    const raw = JSON.stringify({
      propertyCode: 'temperature',
      value: 80,
      timestamp: '2026-09-11T08:00:00.000Z',
    });
    expect(parseTelemetryPayload(raw)).toEqual([
      { propertyCode: 'temperature', value: 80, timestamp: '2026-09-11T08:00:00.000Z' },
    ]);
  });

  it('解析裸属性表（格式 4），跳过保留键', () => {
    const raw = JSON.stringify({
      deviceCode: 'TRANS-001',
      temperature: 65,
      load: 70,
    });
    // deviceCode 为保留键，应只产出 temperature、load
    expect(parseTelemetryPayload(raw)).toEqual([
      { propertyCode: 'temperature', value: 65 },
      { propertyCode: 'load', value: 70 },
    ]);
  });

  it('把字符串数字解析为数值', () => {
    const raw = JSON.stringify({ properties: { temperature: '65.2', load: '71' } });
    expect(parseTelemetryPayload(raw)).toEqual([
      { propertyCode: 'temperature', value: 65.2 },
      { propertyCode: 'load', value: 71 },
    ]);
  });

  it('跳过非数值属性（字符串枚举 / 布尔）', () => {
    const raw = JSON.stringify({
      properties: { temperature: 65.2, status: 'running', online: true },
    });
    expect(parseTelemetryPayload(raw)).toEqual([{ propertyCode: 'temperature', value: 65.2 }]);
  });

  it('跳过空字符串 / 空白 propertyCode', () => {
    const raw = JSON.stringify({ properties: { '': 1, '  ': 2, ok: 3 } });
    expect(parseTelemetryPayload(raw)).toEqual([{ propertyCode: 'ok', value: 3 }]);
  });

  it('解析 Buffer 输入', () => {
    const buf = Buffer.from(JSON.stringify({ properties: { temperature: 65.2 } }), 'utf8');
    expect(parseTelemetryPayload(buf)).toEqual([{ propertyCode: 'temperature', value: 65.2 }]);
  });

  it('提取毫秒时间戳（number）', () => {
    const ts = 1_758_182_400_000;
    const raw = JSON.stringify({ properties: { temperature: 65 }, timestamp: ts });
    expect(parseTelemetryPayload(raw)).toEqual([
      { propertyCode: 'temperature', value: 65, timestamp: ts },
    ]);
  });

  it('非法 JSON 返回空数组（不抛错）', () => {
    expect(parseTelemetryPayload('not-json{')).toEqual([]);
    expect(parseTelemetryPayload('{broken')).toEqual([]);
  });

  it('非对象 / 数组 / null 返回空数组', () => {
    expect(parseTelemetryPayload('42')).toEqual([]);
    expect(parseTelemetryPayload('"str"')).toEqual([]);
    expect(parseTelemetryPayload('[]')).toEqual([]);
    expect(parseTelemetryPayload('null')).toEqual([]);
  });
});

describe('topicToRegExp', () => {
  it('普通主题精确匹配', () => {
    const re = topicToRegExp('device/TRANS-001/telemetry');
    expect(re.test('device/TRANS-001/telemetry')).toBe(true);
    expect(re.test('device/TRANS-002/telemetry')).toBe(false);
    expect(re.test('device/TRANS-001/telemetry/extra')).toBe(false);
  });

  it('+ 通配单段，不匹配多段', () => {
    const re = topicToRegExp('device/+/telemetry');
    expect(re.test('device/TRANS-001/telemetry')).toBe(true);
    expect(re.test('device/TRANS-002/telemetry')).toBe(true);
    expect(re.test('device/TRANS-001/raw/telemetry')).toBe(false);
  });

  it('# 通配多级', () => {
    const re = topicToRegExp('device/TRANS-001/#');
    expect(re.test('device/TRANS-001/telemetry')).toBe(true);
    expect(re.test('device/TRANS-001/a/b/c')).toBe(true);
    expect(re.test('device/TRANS-002/x')).toBe(false);
  });

  it('对正则特殊字符做转义（如 $ 主题）', () => {
    const re = topicToRegExp('$share/group/device/TRANS-001/telemetry');
    // $ 不应被当成正则锚点；整串应按字面匹配
    expect(re.test('$share/group/device/TRANS-001/telemetry')).toBe(true);
    expect(re.test('Xshare/group/device/TRANS-001/telemetry')).toBe(false);
  });

  it('生成的一定锚定首尾（^...$）', () => {
    const re = topicToRegExp('a/b');
    expect(re.source.startsWith('^')).toBe(true);
    expect(re.source.endsWith('$')).toBe(true);
  });
});
