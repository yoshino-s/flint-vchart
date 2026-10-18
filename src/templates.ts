import type { TemplateDefinition } from './types.js';
import { ecAllTemplateDefs, vlAllTemplateDefs } from 'flint-chart';

const template = (
  chart: string,
  output: string,
  channels: string,
  required: string,
): TemplateDefinition => ({
  chart,
  output,
  channels: channels.split(' ').filter(Boolean),
  required: required.split(' ').filter(Boolean),
});

/** Public template union from flint-chart@0.5.1's VL and ECharts registries. */
const outputTemplates: readonly TemplateDefinition[] = [
  template('Scatter Plot', 'scatter', 'x y color size shape opacity column row', 'x y'),
  template('Regression', 'regression', 'x y color size column row', 'x y'),
  template('Connected Scatter Plot', 'connectedScatter', 'x y order color detail column row', 'x y'),
  template('Ranged Dot Plot', 'rangedDot', 'x y color', 'x y'),
  template('Boxplot', 'boxplot', 'x y color opacity column row', 'x y'),
  template('Strip Plot', 'strip', 'x y color size column row', 'x y'),
  template('Bar Chart', 'bar', 'x y color opacity column row', 'x y'),
  template('Grouped Bar Chart', 'groupedBar', 'x y group color column row', 'x y'),
  template('Stacked Bar Chart', 'stackedBar', 'x y color column row', 'x y'),
  template('Lollipop Chart', 'lollipop', 'x y color column row', 'x y'),
  template('Pyramid Chart', 'pyramid', 'x y color', 'x y'),
  template('Heatmap', 'heatmap', 'x y color column row', 'x y color'),
  template('Calendar Heatmap', 'calendarHeatmap', 'x color', 'x color'),
  template('Line Chart', 'line', 'x y color opacity strokeDash column row', 'x y'),
  template('Bump Chart', 'bump', 'x y color detail column row', 'x y'),
  template('Slope Chart', 'slope', 'x y color detail column row', 'x y'),
  template('Area Chart', 'area', 'x y color opacity column row', 'x y'),
  template('Streamgraph', 'streamgraph', 'x y color column row', 'x y color'),
  template('Range Area Chart', 'rangeArea', 'x y y2 color column row', 'x y y2'),
  template('Pie Chart', 'pie', 'size color column row', 'size color'),
  template('Donut Chart', 'donut', 'size color column row', 'size color'),
  template('Funnel Chart', 'funnel', 'y size', 'y size'),
  template('Treemap', 'treemap', 'color size detail', 'color size'),
  template('Sunburst Chart', 'sunburst', 'color size detail group', 'color size'),
  template('Tree', 'tree', 'color detail size', 'detail'),
  template('Histogram', 'histogram', 'x color column row', 'x'),
  template('Density Plot', 'density', 'x color column row', 'x'),
  template('ECDF Plot', 'ecdf', 'x color detail column row', 'x'),
  template('Parallel Coordinates', 'parallel', 'color detail', 'detail'),
  template('Candlestick Chart', 'candlestick', 'x open high low close column row', 'x open high low close'),
  template('Waterfall Chart', 'waterfall', 'x y color column row', 'x y'),
  template('Gantt Chart', 'gantt', 'y x x2 color detail column row', 'y x x2'),
  template('Bullet Chart', 'bullet', 'y x goal color column row', 'y x goal'),
  template('Radar Chart', 'radar', 'x y color column row', 'x y'),
  template('Rose Chart', 'rose', 'x y color column row', 'x y'),
  template('Gauge Chart', 'gauge', 'size column', 'size'),
  template('Sankey Diagram', 'sankey', 'x y size', 'x y size'),
  template('Network Graph', 'network', 'x y size', 'x y'),
  template('Bar Table', 'barTable', 'x y color column row', 'x y'),
  template('Choropleth', 'choropleth', 'id color detail', 'id color'),
  template('Map', 'map', 'latitude longitude color size detail', 'latitude longitude'),
  template('KPI Card', 'kpi', 'metric value goal color', 'value'),
  template('Sparkline', 'sparkline', 'x y color detail row', 'x y'),
  template('Violin Plot', 'violin', 'x y color column row', 'x y'),
] as const;

const upstreamTemplates = [...vlAllTemplateDefs, ...ecAllTemplateDefs];
const upstreamByName = new Map<string, Set<string>>();
for (const item of upstreamTemplates) {
  const channels = upstreamByName.get(item.chart) ?? new Set<string>();
  item.channels.forEach(channel => channels.add(channel));
  upstreamByName.set(item.chart, channels);
}

/**
 * Authoritative public template list. Channels come from Flint itself instead
 * of a copied list, so a dependency update cannot silently drift.
 */
export const FLINT_TEMPLATES: readonly TemplateDefinition[] = outputTemplates.map(item => {
  const channels = [...(upstreamByName.get(item.chart) ?? [])];
  const required = channels.includes('x') && channels.includes('y')
    ? ['x', 'y']
    : item.chart === 'KPI Card'
      ? ['metric', 'value']
      : [];
  return { ...item, channels, required };
});

const missingCompilers = [...upstreamByName.keys()].filter(
  name => !outputTemplates.some(item => item.chart === name),
);
if (missingCompilers.length > 0) {
  throw new Error(`Missing VChart compilers for Flint templates: ${missingCompilers.join(', ')}`);
}

const aliases: Record<string, string> = {
  'bubble chart': 'Scatter Plot',
  'box plot': 'Boxplot',
  boxplot: 'Boxplot',
  'column chart': 'Bar Chart',
  'grouped column chart': 'Grouped Bar Chart',
  'stacked column chart': 'Stacked Bar Chart',
  'doughnut chart': 'Donut Chart',
  funnel: 'Funnel Chart',
  sunburst: 'Sunburst Chart',
  waterfall: 'Waterfall Chart',
};

const byName = new Map(FLINT_TEMPLATES.map(item => [item.chart.toLowerCase(), item]));

export function getTemplate(chartType: string): TemplateDefinition | undefined {
  const key = chartType.trim().toLowerCase();
  return byName.get((aliases[key] ?? chartType).toLowerCase());
}

export const supportedChartTypes = Object.freeze(FLINT_TEMPLATES.map(item => item.chart));
