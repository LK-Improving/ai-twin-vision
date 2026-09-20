import { ComponentType, ComponentCategory, type ComponentConfigSchema } from '@dt/shared-types';
import { registerWidget } from '../registry';

import ChartLine from '../components/chart/ChartLine.vue';
import ChartBar from '../components/chart/ChartBar.vue';
import ChartPie from '../components/chart/ChartPie.vue';
import ChartGauge from '../components/chart/ChartGauge.vue';

import TextLabel from '../components/ui/TextLabel.vue';
import MetricCard from '../components/ui/MetricCard.vue';
import DataTable from '../components/ui/DataTable.vue';
import ImageBox from '../components/ui/ImageBox.vue';
import VideoPlayer from '../components/ui/VideoPlayer.vue';
import ActionButton from '../components/ui/ActionButton.vue';
import PanelBox from '../components/ui/PanelBox.vue';
import NavTabs from '../components/ui/NavTabs.vue';
import AlertList from '../components/ui/AlertList.vue';
import PoiMarker from '../components/ui/PoiMarker.vue';
import TopBar from '../components/ui/TopBar.vue';
import ProgressList from '../components/ui/ProgressList.vue';
import StatBlock from '../components/ui/StatBlock.vue';

/** 简单线性图标 path（与组件一一对应，供编辑器面板展示） */
const ICONS: Record<string, string> = {
  [ComponentType.CHART_LINE]: 'M3 17l6-6 4 4 7-8',
  [ComponentType.CHART_BAR]: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  [ComponentType.CHART_PIE]: 'M12 2a10 10 0 1 0 10 10h-10z',
  [ComponentType.CHART_GAUGE]: 'M12 13a8 8 0 1 1 8 8',
  [ComponentType.TEXT]: 'M4 6h16M4 12h10M4 18h14',
  [ComponentType.METRIC_CARD]: 'M3 13l4-4 4 3 7-7',
  [ComponentType.TABLE]: 'M3 5h18v14H3zM3 10h18M3 15h18',
  [ComponentType.IMAGE]: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6',
  [ComponentType.VIDEO]: 'M3 5h18v14H3zM10 9l5 3-5 3z',
  [ComponentType.BUTTON]: 'M5 8h14v8H5z',
  [ComponentType.PANEL]: 'M3 4h18v16H3z',
  [ComponentType.NAV_TABS]: 'M3 6h18v12H3zM8 6v12M16 6v12',
  [ComponentType.ALERT_LIST]: 'M4 6h16v3H4zM4 12h16v3H4zM4 18h10v3H4z',
  [ComponentType.POI_MARKER]: 'M12 2C6 2 2 7 2 12s10 13 10 13 10-8 10-13-4-10-10-10z',
  [ComponentType.TOP_BAR]: 'M3 5h18v4H3zM3 12h12v7H3zM17 12h4v7h-4z',
  [ComponentType.PROGRESS_LIST]: 'M4 7h16M4 12h10M4 17h13',
  [ComponentType.STAT_BLOCK]: 'M12 3v18M4 8h16M4 16h16',
};

/* ----------------------------- 图表类 ----------------------------- */

const lineSchema: ComponentConfigSchema = {
  props: [
    { key: 'title', label: '标题', type: 'string', default: '' },
    { key: 'xField', label: 'X 字段', type: 'string', default: 'name' },
    { key: 'yField', label: 'Y 字段', type: 'string', default: 'value' },
    { key: 'smooth', label: '平滑曲线', type: 'boolean', default: false },
    { key: 'area', label: '面积填充', type: 'boolean', default: false },
    { key: 'legend', label: '显示图例', type: 'boolean', default: true },
    { key: 'colors', label: '配色', type: 'json', default: ['#00eaff', '#ffcc00', '#36cfc9'] },
    {
      key: 'grid',
      label: '网格边距',
      type: 'json',
      default: { left: 44, right: 24, top: 44, bottom: 32 },
    },
  ],
  dataFields: [{ key: 'data', label: '图表数据', type: 'array', required: false }],
  actions: [{ name: 'refresh', label: '刷新', params: [] }],
};

const barSchema: ComponentConfigSchema = {
  props: [
    { key: 'title', label: '标题', type: 'string', default: '' },
    { key: 'xField', label: 'X 字段', type: 'string', default: 'name' },
    { key: 'yField', label: 'Y 字段', type: 'string', default: 'value' },
    { key: 'horizontal', label: '横向条形', type: 'boolean', default: false },
    { key: 'legend', label: '显示图例', type: 'boolean', default: true },
    { key: 'colors', label: '配色', type: 'json', default: ['#00eaff', '#36cfc9', '#ffcc00'] },
    {
      key: 'grid',
      label: '网格边距',
      type: 'json',
      default: { left: 44, right: 24, top: 44, bottom: 32 },
    },
  ],
  dataFields: [{ key: 'data', label: '图表数据', type: 'array', required: false }],
};

const pieSchema: ComponentConfigSchema = {
  props: [
    { key: 'title', label: '标题', type: 'string', default: '' },
    { key: 'nameField', label: '名称字段', type: 'string', default: 'name' },
    { key: 'valueField', label: '数值字段', type: 'string', default: 'value' },
    { key: 'doughnut', label: '环形', type: 'boolean', default: false },
    { key: 'legend', label: '显示图例', type: 'boolean', default: true },
    {
      key: 'colors',
      label: '配色',
      type: 'json',
      default: ['#00eaff', '#36cfc9', '#ffcc00', '#ff7a45', '#9254de'],
    },
  ],
  dataFields: [{ key: 'data', label: '图表数据', type: 'array', required: false }],
};

const gaugeSchema: ComponentConfigSchema = {
  props: [
    { key: 'title', label: '标题', type: 'string', default: '指标' },
    { key: 'value', label: '数值', type: 'number', default: 0 },
    { key: 'max', label: '最大值', type: 'number', default: 100 },
    { key: 'unit', label: '单位', type: 'string', default: '' },
    { key: 'color', label: '主题色', type: 'color', default: '#00eaff' },
    { key: 'valueField', label: '数据字段', type: 'string', default: 'value' },
  ],
  dataFields: [{ key: 'data', label: '数值数据', type: 'array', required: false }],
};

/* ----------------------------- UI 类 ----------------------------- */

const textSchema: ComponentConfigSchema = {
  props: [
    { key: 'text', label: '文本', type: 'string', default: '文本内容' },
    { key: 'fontSize', label: '字号', type: 'slider', default: 14, min: 10, max: 64, step: 1 },
    { key: 'color', label: '颜色', type: 'color', default: '#cfe8ff' },
    {
      key: 'align',
      label: '对齐',
      type: 'select',
      default: 'left',
      options: [
        { label: '左', value: 'left' },
        { label: '中', value: 'center' },
        { label: '右', value: 'right' },
      ],
    },
    { key: 'bold', label: '加粗', type: 'boolean', default: false },
    { key: 'glow', label: '发光', type: 'boolean', default: false },
  ],
};

const metricSchema: ComponentConfigSchema = {
  props: [
    { key: 'title', label: '标题', type: 'string', default: '指标' },
    { key: 'value', label: '数值', type: 'number', default: 0 },
    { key: 'unit', label: '单位', type: 'string', default: '' },
    { key: 'trend', label: '趋势', type: 'number', default: 0 },
    { key: 'color', label: '主题色', type: 'color', default: '#00eaff' },
    {
      key: 'icon',
      label: '图标 SVG Path',
      type: 'string',
      default: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    },
    { key: 'compact', label: '紧凑模式', type: 'boolean', default: false },
  ],
  dataFields: [{ key: 'data', label: '指标数据', type: 'object', required: false }],
};

const tableSchema: ComponentConfigSchema = {
  props: [
    {
      key: 'columns',
      label: '列定义',
      type: 'json',
      default: [
        { key: 'name', label: '名称' },
        { key: 'value', label: '数值' },
      ],
    },
    { key: 'rows', label: '静态数据', type: 'json', default: [] },
    { key: 'zebra', label: '斑马纹', type: 'boolean', default: true },
    { key: 'autoScroll', label: '自动滚动', type: 'boolean', default: false },
    {
      key: 'scrollSpeed',
      label: '滚动速度',
      type: 'slider',
      default: 30,
      min: 5,
      max: 100,
      step: 5,
    },
  ],
  dataFields: [{ key: 'data', label: '表格数据', type: 'array', required: false }],
};

const imageSchema: ComponentConfigSchema = {
  props: [
    { key: 'src', label: '图片地址', type: 'image', default: '' },
    {
      key: 'fit',
      label: '填充方式',
      type: 'select',
      default: 'cover',
      options: [
        { label: '裁剪', value: 'cover' },
        { label: '完整', value: 'contain' },
        { label: '拉伸', value: 'fill' },
      ],
    },
    { key: 'radius', label: '圆角', type: 'slider', default: 0, min: 0, max: 40, step: 1 },
  ],
};

const videoSchema: ComponentConfigSchema = {
  props: [
    { key: 'src', label: '视频地址', type: 'string', default: '' },
    { key: 'poster', label: '封面', type: 'image', default: '' },
    { key: 'autoplay', label: '自动播放', type: 'boolean', default: false },
    { key: 'muted', label: '静音', type: 'boolean', default: true },
  ],
};

const buttonSchema: ComponentConfigSchema = {
  props: [
    { key: 'label', label: '文字', type: 'string', default: '按钮' },
    { key: 'color', label: '主题色', type: 'color', default: '#00eaff' },
    { key: 'round', label: '圆角', type: 'boolean', default: false },
  ],
  emits: [{ name: 'click', label: '点击' }],
};

const panelSchema: ComponentConfigSchema = {
  props: [
    { key: 'title', label: '标题', type: 'string', default: '面板' },
    { key: 'borderColor', label: '边框色', type: 'color', default: '#00eaff' },
    { key: 'glow', label: '发光', type: 'boolean', default: false },
    { key: 'icon', label: '标题图标 SVG Path', type: 'string', default: '' },
    { key: 'iconColor', label: '图标色', type: 'color', default: '#00eaff' },
    { key: 'headerTabs', label: '标题栏标签', type: 'json', default: [] },
    { key: 'activeTab', label: '激活标签索引', type: 'number', default: 0 },
  ],
};

const navTabsSchema: ComponentConfigSchema = {
  props: [
    {
      key: 'tabs',
      label: '标签列表（逗号分隔或 JSON 数组）',
      type: 'json',
      default: ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'],
    },
    { key: 'activeIndex', label: '默认激活索引', type: 'number', default: 0 },
  ],
  actions: [
    {
      name: 'change',
      label: '切换标签',
      params: [
        { key: 'index', label: '索引', type: 'number' },
        { key: 'tab', label: '标签名', type: 'string' },
      ],
    },
  ],
};

const alertListSchema: ComponentConfigSchema = {
  props: [
    { key: 'autoScroll', label: '自动滚动', type: 'boolean', default: true },
    { key: 'items', label: '静态告警数据', type: 'json', default: [] },
  ],
  dataFields: [{ key: 'data', label: '告警列表', type: 'array', required: false }],
};

const poiMarkerSchema: ComponentConfigSchema = {
  props: [
    { key: 'label', label: '标签文本', type: 'string', default: '标注' },
    { key: 'color', label: '主题色', type: 'color', default: '#ffd666' },
    { key: 'icon', label: '图标 SVG Path', type: 'string', default: '' },
    { key: 'pulse', label: '脉冲动画', type: 'boolean', default: true },
  ],
};

const topBarSchema: ComponentConfigSchema = {
  props: [
    { key: 'title', label: '主标题', type: 'string', default: '数智指挥大厅' },
    { key: 'subtitle', label: '英文副标题', type: 'string', default: '' },
    {
      key: 'tabs',
      label: '导航标签',
      type: 'json',
      default: ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'],
    },
    { key: 'activeIndex', label: '激活索引', type: 'number', default: 0 },
    { key: 'userName', label: '用户名', type: 'string', default: '王主任' },
    { key: 'showTools', label: '显示右侧工具', type: 'boolean', default: true },
    { key: 'color', label: '主题色', type: 'color', default: '#00e0ff' },
  ],
  actions: [
    {
      name: 'change',
      label: '切换标签',
      params: [
        { key: 'index', label: '索引', type: 'number' },
        { key: 'tab', label: '标签名', type: 'string' },
      ],
    },
  ],
};

const progressListSchema: ComponentConfigSchema = {
  props: [
    { key: 'items', label: '条目', type: 'json', default: [] },
    { key: 'showValue', label: '显示数值', type: 'boolean', default: true },
  ],
};

const statBlockSchema: ComponentConfigSchema = {
  props: [{ key: 'items', label: '大数字条目', type: 'json', default: [] }],
};

/* ----------------------------- 注册 ----------------------------- */

registerWidget({
  type: ComponentType.CHART_LINE,
  name: '折线图',
  category: ComponentCategory.CHART,
  icon: ICONS[ComponentType.CHART_LINE],
  defaultRect: { x: 0, y: 0, width: 480, height: 300 },
  defaultProps: {
    title: '',
    xField: 'name',
    yField: 'value',
    smooth: false,
    area: false,
    legend: true,
    colors: ['#00eaff', '#ffcc00', '#36cfc9'],
    grid: { left: 44, right: 24, top: 44, bottom: 32 },
  },
  configSchema: lineSchema,
  component: ChartLine,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.CHART_BAR,
  name: '柱状图',
  category: ComponentCategory.CHART,
  icon: ICONS[ComponentType.CHART_BAR],
  defaultRect: { x: 0, y: 0, width: 480, height: 300 },
  defaultProps: {
    title: '',
    xField: 'name',
    yField: 'value',
    horizontal: false,
    legend: true,
    colors: ['#00eaff', '#36cfc9', '#ffcc00'],
    grid: { left: 44, right: 24, top: 44, bottom: 32 },
  },
  configSchema: barSchema,
  component: ChartBar,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.CHART_PIE,
  name: '饼图',
  category: ComponentCategory.CHART,
  icon: ICONS[ComponentType.CHART_PIE],
  defaultRect: { x: 0, y: 0, width: 360, height: 300 },
  defaultProps: {
    title: '',
    nameField: 'name',
    valueField: 'value',
    doughnut: false,
    legend: true,
    colors: ['#00eaff', '#36cfc9', '#ffcc00', '#ff7a45', '#9254de'],
  },
  configSchema: pieSchema,
  component: ChartPie,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.CHART_GAUGE,
  name: '仪表盘',
  category: ComponentCategory.CHART,
  icon: ICONS[ComponentType.CHART_GAUGE],
  defaultRect: { x: 0, y: 0, width: 280, height: 260 },
  defaultProps: {
    title: '指标',
    value: 0,
    max: 100,
    unit: '',
    color: '#00eaff',
    valueField: 'value',
  },
  configSchema: gaugeSchema,
  component: ChartGauge,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.TEXT,
  name: '文本',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.TEXT],
  defaultRect: { x: 0, y: 0, width: 240, height: 40 },
  defaultProps: {
    text: '文本内容',
    fontSize: 14,
    color: '#cfe8ff',
    align: 'left',
    bold: false,
    glow: false,
  },
  configSchema: textSchema,
  component: TextLabel,
});

registerWidget({
  type: ComponentType.METRIC_CARD,
  name: '指标卡',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.METRIC_CARD],
  defaultRect: { x: 0, y: 0, width: 240, height: 120 },
  defaultProps: {
    title: '指标',
    value: 0,
    unit: '',
    trend: 0,
    color: '#00d8ff',
    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    compact: false,
  },
  configSchema: metricSchema,
  component: MetricCard,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.TABLE,
  name: '数据表',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.TABLE],
  defaultRect: { x: 0, y: 0, width: 480, height: 280 },
  defaultProps: {
    columns: [
      { key: 'name', label: '名称' },
      { key: 'value', label: '数值' },
    ],
    rows: [],
    zebra: true,
    autoScroll: false,
    scrollSpeed: 30,
  },
  configSchema: tableSchema,
  component: DataTable,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.IMAGE,
  name: '图片',
  category: ComponentCategory.MEDIA,
  icon: ICONS[ComponentType.IMAGE],
  defaultRect: { x: 0, y: 0, width: 320, height: 200 },
  defaultProps: { src: '', fit: 'cover', radius: 0 },
  configSchema: imageSchema,
  component: ImageBox,
});

registerWidget({
  type: ComponentType.VIDEO,
  name: '视频',
  category: ComponentCategory.MEDIA,
  icon: ICONS[ComponentType.VIDEO],
  defaultRect: { x: 0, y: 0, width: 480, height: 270 },
  defaultProps: { src: '', poster: '', autoplay: false, muted: true },
  configSchema: videoSchema,
  component: VideoPlayer,
});

registerWidget({
  type: ComponentType.BUTTON,
  name: '按钮',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.BUTTON],
  defaultRect: { x: 0, y: 0, width: 120, height: 40 },
  defaultProps: { label: '按钮', color: '#00eaff', round: false },
  configSchema: buttonSchema,
  component: ActionButton,
});

registerWidget({
  type: ComponentType.PANEL,
  name: '面板容器',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.PANEL],
  defaultRect: { x: 0, y: 0, width: 400, height: 300 },
  defaultProps: { title: '面板', borderColor: '#2ea8d8', glow: true, headerTabs: [], activeTab: 0 },
  configSchema: panelSchema,
  component: PanelBox,
});

registerWidget({
  type: ComponentType.TOP_BAR,
  name: '顶部通栏',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.TOP_BAR],
  defaultRect: { x: 0, y: 0, width: 1920, height: 86 },
  defaultProps: {
    title: '数智指挥大厅',
    subtitle: '',
    tabs: ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'],
    activeIndex: 0,
    userName: '王主任',
    showTools: true,
    color: '#00e0ff',
  },
  configSchema: topBarSchema,
  component: TopBar,
});

registerWidget({
  type: ComponentType.PROGRESS_LIST,
  name: '进度列表',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.PROGRESS_LIST],
  defaultRect: { x: 0, y: 0, width: 300, height: 160 },
  defaultProps: { items: [], showValue: true },
  configSchema: progressListSchema,
  component: ProgressList,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.STAT_BLOCK,
  name: '大数字组',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.STAT_BLOCK],
  defaultRect: { x: 0, y: 0, width: 600, height: 130 },
  defaultProps: { items: [] },
  configSchema: statBlockSchema,
  component: StatBlock,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.NAV_TABS,
  name: '导航标签',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.NAV_TABS],
  defaultRect: { x: 0, y: 0, width: 520, height: 44 },
  defaultProps: {
    tabs: ['综合总览', '招商引资', '环保监管', '安全生产', '经济运行'],
    activeIndex: 0,
  },
  configSchema: navTabsSchema,
  component: NavTabs,
});

registerWidget({
  type: ComponentType.ALERT_LIST,
  name: '告警列表',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.ALERT_LIST],
  defaultRect: { x: 0, y: 0, width: 360, height: 220 },
  defaultProps: { autoScroll: true, items: [] },
  configSchema: alertListSchema,
  component: AlertList,
  dataDriven: true,
});

registerWidget({
  type: ComponentType.POI_MARKER,
  name: 'POI 标记',
  category: ComponentCategory.UI,
  icon: ICONS[ComponentType.POI_MARKER],
  defaultRect: { x: 0, y: 0, width: 120, height: 32 },
  defaultProps: { label: '标注', color: '#ffd666', pulse: true },
  configSchema: poiMarkerSchema,
  component: PoiMarker,
});
