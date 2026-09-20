import { ComponentType, type WidgetNode, type WidgetRect } from '@dt/shared-types';
import type { PanelSpec, SceneDsl } from './types';

/** 设计稿尺寸 */
const W = 1920;
const H = 1080;

let seq = 0;
const uid = (p: string) => `${p}-${++seq}`;

function node(o: {
  id?: string;
  type: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  props?: Record<string, unknown>;
  style?: Record<string, string | number>;
  children?: WidgetNode[];
}): WidgetNode {
  const n: WidgetNode = {
    id: o.id ?? uid('node'),
    type: o.type,
    name: o.name,
    rect: { x: o.x, y: o.y, width: o.w, height: o.h, zIndex: o.z ?? 5 } as WidgetRect,
    props: o.props ?? {},
  };
  if (o.style) n.style = o.style;
  if (o.children && o.children.length) n.children = o.children;
  return n;
}

function panel(o: {
  id?: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  borderColor?: string;
  glow?: boolean;
  headerTabs?: string[];
  children: WidgetNode[];
}): WidgetNode {
  return node({
    id: o.id,
    type: ComponentType.PANEL,
    name: o.title,
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    z: o.z ?? 5,
    props: {
      title: o.title,
      borderColor: o.borderColor ?? '#2ea8d8',
      glow: o.glow ?? true,
      icon: '',
      headerTabs: o.headerTabs ?? [],
      activeTab: 0,
    },
    children: o.children,
  });
}

const ICON_BUILDING = 'M3 21h18M5 21V7l8-4 8 4v14M8 21v-9h8v9';
const ICON_MONEY = 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6';
const ICON_TARGET = 'M12 2a10 10 0 1 0 10 10h-10z';
const ICON_LEAF = 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z';

/**
 * DSL（panels 段）→ 2D 大屏 WidgetNode 树。
 * 槽位映射（详细设计 §9.2）：
 *   topbar → TOP_BAR；kpi-row/METRIC_CARD → 一排指标卡；
 *   CHART_LINE/CHART_PIE → 左右列 PANEL 内嵌图表；
 *   ALERT_LIST → 左下列告警面板；STAT_BLOCK → 底部大数字。
 * 若规划器未产出某槽位，使用基于 meta 的安全兜底，保证大屏不为空。
 */
export function dslToLayout(dsl: SceneDsl): WidgetNode[] {
  seq = 0;
  const nodes: WidgetNode[] = [];
  const panels = dsl.panels ?? [];

  // 底部暗角遮罩：统一三维画布色调、突出面板
  nodes.push(
    node({
      id: 'ai-bg-vignette',
      type: ComponentType.TEXT,
      name: '暗角遮罩',
      x: 0,
      y: 0,
      w: W,
      h: H,
      z: 1,
      props: { text: '' },
      style: {
        background:
          'radial-gradient(ellipse at 50% 46%, rgba(3,12,26,0.06) 0%, rgba(3,12,26,0.42) 58%, rgba(3,12,26,0.86) 100%)',
        pointerEvents: 'none',
      },
    }),
  );

  // 顶部通栏
  const topbar = panels.find((p) => p.type === 'TOP_BAR' || p.slot === 'topbar');
  nodes.push(
    node({
      id: 'ai-topbar',
      type: ComponentType.TOP_BAR,
      name: '顶部通栏',
      x: 0,
      y: 0,
      w: W,
      h: 92,
      z: 30,
      props: {
        title: topbar?.title ?? dsl.meta.title,
        subtitle: dsl.meta.summary ?? '',
        tabs: topbar?.tabs ?? ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'],
        activeIndex: 0,
        userName: '管理员',
        showTools: true,
        color: '#00e0ff',
      },
    }),
  );

  // 顶部核心 KPI 卡（导航下方一排）
  const kpi = panels.find((p) => p.type === 'METRIC_CARD' || p.slot === 'kpi-row') ?? {
    slot: 'kpi-row',
    type: 'METRIC_CARD' as const,
    items: [],
  };
  const metrics = (kpi.items ?? []) as unknown as Array<{
    title?: string;
    value?: number;
    unit?: string;
    trend?: number;
    color?: string;
  }>;
  metrics.forEach((m, i) => {
    nodes.push(
      node({
        id: `ai-kpi-${i}`,
        type: ComponentType.METRIC_CARD,
        name: m.title ?? '指标',
        x: 496 + i * 236,
        y: 100,
        w: 220,
        h: 74,
        z: 12,
        props: {
          title: m.title ?? '指标',
          value: m.value ?? 0,
          unit: m.unit ?? '',
          trend: m.trend ?? 0,
          color: m.color ?? '#00d8ff',
          icon: ICON_BUILDING,
        },
      }),
    );
  });

  // 左列图表 / 告警
  const pie = panels.find((p) => p.type === 'CHART_PIE');
  const line = panels.find((p) => p.type === 'CHART_LINE');
  const alert = panels.find((p) => p.type === 'ALERT_LIST' || p.slot === 'alerts');

  if (pie) {
    nodes.push(
      panel({
        id: 'ai-pie',
        title: pie.title ?? '业态分布',
        x: 20,
        y: 620,
        w: 420,
        h: 186,
        children: [
          node({
            type: ComponentType.CHART_PIE,
            name: '业态分布',
            x: 10,
            y: 34,
            w: 400,
            h: 144,
            props: {
              nameField: 'name',
              valueField: 'value',
              doughnut: true,
              legend: true,
              colors: ['#00d8ff', '#36cfc9', '#ffcc00', '#ff7a45', '#9254de'],
              data: pie.data ?? [],
            },
          }),
        ],
      }),
    );
  }
  if (line) {
    nodes.push(
      panel({
        id: 'ai-line',
        title: line.title ?? '趋势',
        x: 20,
        y: 412,
        w: 420,
        h: 196,
        headerTabs: ['月度', '年度'],
        children: [
          node({
            type: ComponentType.CHART_LINE,
            name: '趋势',
            x: 10,
            y: 36,
            w: 400,
            h: 150,
            props: {
              title: '',
              xField: 'name',
              yField: 'value',
              smooth: true,
              area: true,
              legend: false,
              colors: ['#00d8ff'],
              grid: { left: 44, right: 16, top: 18, bottom: 26 },
              data: line.data ?? [],
            },
          }),
        ],
      }),
    );
  }
  if (alert) {
    nodes.push(
      panel({
        id: 'ai-alert',
        title: alert.title ?? '实时告警',
        x: 20,
        y: 818,
        w: 420,
        h: 226,
        borderColor: '#ff7a45',
        children: [
          node({
            type: ComponentType.ALERT_LIST,
            name: '告警列表',
            x: 10,
            y: 36,
            w: 400,
            h: 174,
            props: { autoScroll: true, items: alert.alerts ?? [] },
          }),
        ],
      }),
    );
  }

  // 右列：核心指标组（取前 3 个 KPI 做紧凑卡）
  if (metrics.length > 0) {
    const rightMetrics = metrics.slice(0, 3);
    nodes.push(
      panel({
        id: 'ai-right-metrics',
        title: '重点指标实时监控',
        x: 1480,
        y: 186,
        w: 420,
        h: 238,
        headerTabs: ['粉尘数据', '安全数据', '能耗数据'],
        children: rightMetrics.map((m, i) =>
          node({
            type: ComponentType.METRIC_CARD,
            name: m.title ?? '指标',
            x: 12,
            y: 40 + i * 68,
            w: 396,
            h: 60,
            props: {
              title: m.title ?? '指标',
              value: m.value ?? 0,
              unit: m.unit ?? '',
              trend: m.trend ?? 0,
              color: m.color ?? '#00d8ff',
              icon: i === 0 ? ICON_LEAF : i === 1 ? ICON_TARGET : ICON_MONEY,
              compact: true,
            },
          }),
        ),
      }),
    );
  }

  // 底部大数字组
  const stat = panels.find((p) => p.type === 'STAT_BLOCK' || p.slot === 'bottom');
  if (stat && Array.isArray(stat.items) && stat.items.length > 0) {
    nodes.push(
      node({
        id: 'ai-stat',
        type: ComponentType.STAT_BLOCK,
        name: '园区总览',
        x: 600,
        y: 876,
        w: 720,
        h: 148,
        z: 12,
        props: { items: stat.items },
      }),
    );
  }

  return nodes;
}
