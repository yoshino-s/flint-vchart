import {
  assembleECharts,
  assembleVegaLite,
  convertTemporalData,
  ecGetTemplateDef,
  normalizeStaticSeries,
  resolveFieldSemantics,
  resolveThemeSpec,
} from 'flint-chart';
import { getTemplate } from './templates.js';
import type {
  CompileResult,
  CompileWarning,
  DataRow,
  FlintEncoding,
  FlintInput,
  ValidationResult,
  VChartSpec,
} from './types.js';

type Dict = Record<string, unknown>;
type Encodings = Record<string, FlintEncoding>;

const DATA_ID = 'flintData';
const isObject = (value: unknown): value is Dict =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function issue(code: string, message: string, path?: string): CompileWarning {
  return { code, message, ...(path ? { path } : {}) };
}

function encodingFields(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap(item => {
    if (typeof item === 'string') return [item];
    if (isObject(item) && typeof item.field === 'string') return [item.field];
    return [];
  });
}

function hasEncodingBinding(value: unknown): boolean {
  const values = Array.isArray(value) ? value : [value];
  return values.some(item =>
    (typeof item === 'string' && item.trim().length > 0) ||
    (isObject(item) && (
      (typeof item.field === 'string' && item.field.trim().length > 0) ||
      item.aggregate === 'count'
    )));
}

function normalize(input: FlintInput): { encodings: Encodings; rows: DataRow[] } {
  const rows = 'values' in input.data ? input.data.values ?? [] : [];
  const normalized = normalizeStaticSeries(
    input.chart_spec.encodings,
    rows,
    input.semantic_types ?? {},
  );
  const converted = convertTemporalData(normalized.data, input.semantic_types ?? {});
  const encodings = Object.fromEntries(Object.entries(normalized.encodings).map(([channel, encoding]) => [
    channel,
    encoding.aggregate === 'count' && !encoding.field
      ? { ...encoding, field: '__flint_count' }
      : encoding,
  ]));
  const aggregated = aggregateRows(converted, encodings);
  return { encodings, rows: sortRows(aggregated, encodings) };
}

function aggregateRows(rows: DataRow[], encodings: Encodings): DataRow[] {
  const measures = Object.values(encodings).filter(
    encoding => encoding.aggregate,
  );
  if (measures.length === 0) return rows;
  const measureFields = new Set(measures.flatMap(encoding => encoding.field ? [encoding.field] : []));
  const dimensions = [...new Set(Object.values(encodings)
    .map(encoding => encoding.field)
    .filter((name): name is string => Boolean(name) && !measureFields.has(name!)))];
  const groups = new Map<string, DataRow[]>();
  for (const row of rows) {
    const key = JSON.stringify(dimensions.map(name => row[name]));
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const result: DataRow = Object.fromEntries(dimensions.map(name => [name, group[0]?.[name]]));
    for (const encoding of measures) {
      const name = encoding.field ?? '__flint_count';
      const numbers = group.map(row => Number(row[name])).filter(Number.isFinite);
      switch (encoding.aggregate) {
        case 'count': result[name] = group.length; break;
        case 'average':
        case 'mean': result[name] = numbers.reduce((sum, value) => sum + value, 0) / (numbers.length || 1); break;
        case 'sum': result[name] = numbers.reduce((sum, value) => sum + value, 0); break;
      }
    }
    return result;
  });
}

function sortRows(rows: DataRow[], encodings: Encodings): DataRow[] {
  for (const encoding of Object.values(encodings)) {
    if (!encoding.field || (!encoding.sortOrder && !encoding.sortBy)) continue;
    const direction = encoding.sortOrder === 'descending' ? -1 : 1;
    if (encoding.sortBy?.trim().startsWith('[')) {
      try {
        const order = JSON.parse(encoding.sortBy) as unknown[];
        const indexes = new Map(order.map((value, index) => [String(value), index]));
        return [...rows].sort((left, right) =>
          ((indexes.get(String(left[encoding.field!])) ?? Number.MAX_SAFE_INTEGER) -
            (indexes.get(String(right[encoding.field!])) ?? Number.MAX_SAFE_INTEGER)) * direction);
      } catch {
        // Flint's assemblers also ignore malformed custom-order JSON.
      }
    }
    const by = encodings[encoding.sortBy ?? '']?.field ?? encoding.sortBy ?? encoding.field;
    return [...rows].sort((left, right) =>
      String(left[by] ?? '').localeCompare(String(right[by] ?? ''), undefined, { numeric: true }) * direction);
  }
  return rows;
}

function field(encodings: Encodings, ...channels: string[]): string | undefined {
  for (const channel of channels) {
    const value = encodings[channel]?.field;
    if (value) return value;
  }
  return undefined;
}

function data(input: FlintInput, rows: DataRow[]): Dict[] {
  if ('url' in input.data) {
    // Like Flint's assemblers, compilation is synchronous: the host resolves
    // URL/path sources and then updates this data id with the loaded rows.
    return [{ id: DATA_ID, values: [] }];
  }
  return [{
    id: DATA_ID,
    values: rows.map(row => ({ ...row })),
  }];
}

function displayName(input: FlintInput, value?: string): string | undefined {
  return value ? input.field_display_names?.[value] ?? value : undefined;
}

function chartProperties(kind: string, raw: Record<string, unknown>): Dict {
  const result: Dict = {};
  if (typeof raw.orient === 'string') result.direction = raw.orient === 'horizontal' ? 'horizontal' : 'vertical';
  if (typeof raw.innerRadius === 'number') result.innerRadius = raw.innerRadius;
  if (typeof raw.showPoints === 'boolean') result.point = { visible: raw.showPoints };
  if (typeof raw.showValueLabels === 'boolean') result.label = { visible: raw.showValueLabels };
  if (typeof raw.fillOpacity === 'number') result.area = { style: { fillOpacity: raw.fillOpacity } };
  if (typeof raw.strokeWidth === 'number') result.line = { style: { lineWidth: raw.strokeWidth } };
  if (typeof raw.nodeWidth === 'number') result.nodeWidth = raw.nodeWidth;
  if (typeof raw.nodeGap === 'number') result.nodeGap = raw.nodeGap;
  if (typeof raw.min === 'number') result.min = raw.min;
  if (typeof raw.max === 'number') result.max = raw.max;
  if (typeof raw.opacity === 'number') {
    result[(['area', 'streamgraph', 'rangeArea', 'violin', 'density'].includes(kind) ? 'area' : 'point')] = {
      style: { fillOpacity: raw.opacity },
    };
  }
  if (raw.stackMode === 'normalize') {
    result.stack = true;
    result.percent = true;
  }
  if (typeof raw.cornerRadius === 'number' && ['bar', 'groupedBar', 'stackedBar'].includes(kind)) {
    result.bar = { style: { cornerRadius: raw.cornerRadius } };
  }
  return result;
}

function baseSpec(input: FlintInput, rows: DataRow[], warnings: CompileWarning[]): VChartSpec {
  const size = input.chart_spec.canvasSize ?? input.chart_spec.baseSize;
  const theme = resolveThemeSpec(input.theme_spec);
  const ink = theme?.ink;
  const palette = ink?.series?.categorical;
  const background = ink?.surface?.canvas;
  const titleColor = ink?.text?.primary;
  const interactions = compileInteractions(input);
  if (input.theme_spec) {
    warnings.push(issue(
      'theme_partially_realized',
      'Theme colors, surface and headline typography are realized; backend-specific geometry and furniture policies may be approximated.',
      'theme_spec',
    ));
  }
  return {
    ...(size?.width ? { width: size.width } : {}),
    ...(size?.height ? { height: size.height } : {}),
    data: data(input, rows),
    ...('url' in input.data ? { __flintDataUrl: input.data.url } : {}),
    ...(background ? { background } : {}),
    ...(palette ? { color: palette } : {}),
    ...(input.chart_spec.title || input.chart_spec.subtitle ? {
      title: {
        visible: true,
        text: input.chart_spec.title ?? '',
        subtext: input.chart_spec.subtitle,
        textStyle: titleColor ? { fill: titleColor } : undefined,
      },
    } : {}),
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    ...interactions,
  };
}

function compileInteractions(input: FlintInput): Dict {
  const interaction = input.interaction_spec;
  if (!interaction) return {};
  const types = new Set(interaction.interactions.map(entry => entry.type));
  return {
    hover: { enable: types.has('hover-group-focus') || types.has('inspect') || types.has('inspect-index') },
    select: {
      enable: types.has('select') || types.has('click-highlight') || types.has('click-group-focus'),
      mode: 'multiple',
    },
    ...(types.has('legend-toggle') ? {
      legends: [{ visible: true, interactive: true, filter: true }],
    } : {}),
    ...(types.has('navigate') || types.has('brush-zoom') ? {
      dataZoom: [{ orient: 'bottom', start: 0, end: 100 }],
    } : {}),
    ...(types.has('select') || types.has('lasso-select') || types.has('linked-brush') ? {
      brush: { brushType: types.has('lasso-select') ? 'polygon' : 'rect' },
    } : {}),
    ...(types.has('inspect-index') ? {
      crosshair: { xField: { visible: true }, yField: { visible: true } },
    } : {}),
  };
}

function collectCapabilityWarnings(input: FlintInput, warnings: CompileWarning[]): void {
  const properties = input.chart_spec.chartProperties ?? {};
  const mappedProperties = new Set([
    'orient', 'innerRadius', 'showPoints', 'showValueLabels', 'fillOpacity',
    'strokeWidth', 'nodeWidth', 'nodeGap', 'min', 'max', 'cornerRadius',
    'opacity', 'stackMode',
  ]);
  for (const property of Object.keys(properties)) {
    if (!mappedProperties.has(property)) {
      warnings.push(issue(
        'approximated_chart_property',
        `chartProperties.${property} has no exact VChart equivalent and is approximated or ignored.`,
        `chart_spec.chartProperties.${property}`,
      ));
    }
  }
  const mappedInteractions = new Set([
    'click-highlight', 'click-group-focus', 'hover-group-focus', 'select',
    'lasso-select', 'brush-x', 'brush-y', 'brush-zoom', 'linked-brush',
    'legend-toggle', 'inspect', 'inspect-index', 'navigate',
  ]);
  for (const interaction of input.interaction_spec?.interactions ?? []) {
    if (!mappedInteractions.has(interaction.type)) {
      warnings.push(issue(
        'approximated_interaction',
        `Interaction preset ${interaction.type} has no exact VChart equivalent.`,
        'interaction_spec.interactions',
      ));
    }
  }
  if (fieldFromRaw(input, 'column') || fieldFromRaw(input, 'row')) {
    warnings.push(issue(
      'faceting_flattened',
      'Facet channels are preserved in the data but are not split into independent panels in this VChart release.',
      'chart_spec.encodings',
    ));
  }
}

function fieldFromRaw(input: FlintInput, channel: string): string | undefined {
  const value = input.chart_spec.encodings[channel];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return undefined;
  return value?.field;
}

function cartesian(
  base: VChartSpec,
  type: string,
  encodings: Encodings,
  input: FlintInput,
  extra: Dict = {},
): VChartSpec {
  const x = field(encodings, 'x');
  const y = field(encodings, 'y');
  const series = field(encodings, 'group', 'color', 'detail');
  return {
    ...base,
    type,
    xField: x,
    yField: y,
    ...(series ? { seriesField: series } : {}),
    axes: [
      { orient: 'bottom', title: { visible: true, text: displayName(input, x) } },
      { orient: 'left', title: { visible: true, text: displayName(input, y) } },
    ],
    ...extra,
  };
}

function hierarchy(rows: DataRow[], pathFields: string[], valueField?: string): DataRow[] {
  const root: Array<DataRow & { children?: DataRow[] }> = [];
  for (const row of rows) {
    let level = root;
    for (let index = 0; index < pathFields.length; index += 1) {
      const pathField = pathFields[index]!;
      const name = String(row[pathField] ?? '');
      let node = level.find(item => item.name === name);
      if (!node) {
        node = { name };
        level.push(node);
      }
      if (index === pathFields.length - 1) {
        if (valueField) node.value = row[valueField];
        Object.assign(node, row);
      } else {
        node.children ??= [];
        level = node.children;
      }
    }
  }
  return root;
}

function withDerivedData(base: VChartSpec, values: DataRow[], id = DATA_ID): VChartSpec {
  return { ...base, data: [{ id, values }] };
}

function compileTemplate(
  input: FlintInput,
  encodings: Encodings,
  rows: DataRow[],
  warnings: CompileWarning[],
): VChartSpec {
  const template = getTemplate(input.chart_spec.chartType)!;
  let base = baseSpec(input, rows, warnings);
  const x = field(encodings, 'x');
  const y = field(encodings, 'y');
  const y2 = field(encodings, 'y2');
  const color = field(encodings, 'color', 'group');
  const size = field(encodings, 'size', 'value');
  const detail = field(encodings, 'detail');
  const series = color ?? detail;
  const properties = chartProperties(template.output, input.chart_spec.chartProperties ?? {});

  switch (template.output) {
    case 'bar':
    case 'groupedBar':
    case 'stackedBar':
    case 'barTable':
      return cartesian(base, 'bar', encodings, input, {
        stack: template.output === 'stackedBar',
        ...(template.output === 'groupedBar' ? { barGapInGroup: '20%' } : {}),
        ...properties,
      });
    case 'line':
    case 'connectedScatter':
    case 'bump':
    case 'slope':
    case 'sparkline':
      return cartesian(base, 'line', encodings, input, {
        point: { visible: template.output !== 'sparkline' },
        ...(field(encodings, 'strokeDash') ? {
          line: {
            style: {
              lineDash: (datum: DataRow) =>
                String(datum[field(encodings, 'strokeDash')!] ?? '').toLowerCase().includes('forecast')
                  ? [6, 4]
                  : [],
            },
          },
        } : {}),
        ...(field(encodings, 'order') ? { sortDataByAxis: true } : {}),
        ...properties,
      });
    case 'area':
    case 'streamgraph':
      return cartesian(base, 'area', encodings, input, {
        stack: template.output === 'streamgraph',
        ...(template.output === 'streamgraph' ? { stackOffset: 'silhouette' } : {}),
        ...properties,
      });
    case 'scatter':
    case 'strip':
    case 'regression': {
      const spec = cartesian(base, 'scatter', encodings, input, {
        sizeField: field(encodings, 'size'),
        shapeField: field(encodings, 'shape'),
        size: field(encodings, 'size') ? [5, 30] : 10,
        ...properties,
      });
      if (template.output === 'regression') {
        const regression = linearRegression(rows, x!, y!);
        spec.type = 'common';
        spec.data = [
          ...(base.data as Dict[]),
          { id: 'flintRegression', values: regression },
        ];
        spec.series = [
          {
            type: 'scatter',
            dataId: DATA_ID,
            xField: x,
            yField: y,
            seriesField: series,
            sizeField: field(encodings, 'size'),
          },
          {
            type: 'line',
            dataId: 'flintRegression',
            xField: x,
            yField: '__flint_regression',
            point: { visible: false },
            line: { style: { lineDash: [6, 4] } },
          },
        ];
      }
      return spec;
    }
    case 'pie':
    case 'donut':
      return {
        ...base,
        type: 'pie',
        categoryField: color,
        valueField: size,
        seriesField: color,
        outerRadius: 0.82,
        innerRadius: template.output === 'donut' ? 0.52 : 0,
        label: { visible: true },
        ...properties,
      };
    case 'radar':
      return { ...base, type: 'radar', categoryField: x, valueField: y, seriesField: series, ...properties };
    case 'rose':
      return { ...base, type: 'rose', categoryField: x, valueField: y, seriesField: series, ...properties };
    case 'funnel':
    case 'pyramid':
      return {
        ...base,
        type: 'funnel',
        categoryField: y ?? x,
        valueField: size ?? y,
        isTransform: template.output === 'pyramid',
        ...properties,
      };
    case 'heatmap':
    case 'calendarHeatmap':
      return {
        ...base,
        type: 'heatmap',
        xField: x,
        yField: y ?? '__flint_calendar_week',
        valueField: color,
        ...properties,
      };
    case 'treemap':
    case 'sunburst':
    case 'tree': {
      const path = [...new Set([field(encodings, 'group'), detail, color].filter(Boolean))] as string[];
      const tree = hierarchy(rows, path.length ? path : [color ?? detail!], size);
      base = withDerivedData(base, tree);
      if (template.output === 'tree') {
        return {
          ...base,
          type: 'common',
          series: [{ type: 'circlePacking', categoryField: 'name', valueField: 'value' }],
          ...properties,
        };
      }
      return {
        ...base,
        type: template.output,
        categoryField: 'name',
        valueField: 'value',
        ...properties,
      };
    }
    case 'rangeArea':
      return {
        ...base,
        type: 'rangeArea',
        xField: x,
        yField: [y, y2],
        seriesField: series,
        ...properties,
      };
    case 'rangedDot':
      return cartesian(base, 'rangeColumn', encodings, input, {
        yField: [y, field(encodings, 'y2') ?? y],
        bar: { style: { width: 4 } },
        ...properties,
      });
    case 'histogram':
      return { ...base, type: 'histogram', xField: x, seriesField: color, ...properties };
    case 'boxplot':
      return { ...base, type: 'boxPlot', xField: x, yField: y, seriesField: color, ...properties };
    case 'waterfall':
      return { ...base, type: 'waterfall', xField: x, yField: y, seriesField: color, ...properties };
    case 'gauge':
      return { ...base, type: 'gauge', valueField: size, categoryField: field(encodings, 'column'), ...properties };
    case 'gantt':
      return {
        ...base,
        type: 'rangeColumn',
        direction: 'horizontal',
        xField: [x, field(encodings, 'x2')],
        yField: y,
        seriesField: color,
        ...properties,
      };
    case 'candlestick': {
      const open = field(encodings, 'open')!;
      const high = field(encodings, 'high')!;
      const low = field(encodings, 'low')!;
      const close = field(encodings, 'close')!;
      const values = rows.map(row => ({ ...row, __flint_ohlc: [row[open], row[close], row[low], row[high]] }));
      base = withDerivedData(base, values);
      return {
        ...base,
        type: 'common',
        series: [{
          type: 'rangeColumn',
          xField: x,
          yField: [low, high],
          bar: { style: { width: 1 } },
        }, {
          type: 'rangeColumn',
          xField: x,
          yField: [open, close],
        }],
        ...properties,
      };
    }
    case 'bullet':
      return {
        ...base,
        type: 'common',
        series: [
          { type: 'bar', direction: 'horizontal', xField: x, yField: y },
          { type: 'scatter', xField: field(encodings, 'goal'), yField: y, size: 14 },
        ],
        ...properties,
      };
    case 'lollipop':
      return {
        ...base,
        type: 'common',
        series: [
          { type: 'bar', xField: x, yField: y, bar: { style: { width: 2 } } },
          { type: 'scatter', xField: x, yField: y, seriesField: series, size: 12 },
        ],
        ...properties,
      };
    case 'density':
    case 'violin':
    case 'ecdf':
      return statistical(base, template.output, encodings, rows, input, properties);
    case 'sankey':
      return {
        ...base,
        type: 'sankey',
        sourceField: x,
        targetField: y,
        valueField: size,
        categoryField: x,
        ...properties,
      };
    case 'network':
      warnings.push(issue(
        'approximated_chart',
        'Network Graph is represented as a Sankey relationship view because VChart has no force/circular graph chart.',
      ));
      return network(base, encodings, rows, properties);
    case 'parallel':
      warnings.push(issue(
        'approximated_chart',
        'Parallel Coordinates is represented as a folded multi-series line chart because VChart has no parallel-coordinate chart.',
      ));
      return parallel(base, encodings, rows, properties);
    case 'choropleth':
      warnings.push(issue(
        'map_registration_required',
        'Choropleth rendering requires the host to register matching GeoJSON with VChart.registerMap.',
        'chart_spec.chartProperties.region',
      ));
      return {
        ...base,
        type: 'map',
        nameField: field(encodings, 'id') ?? detail,
        valueField: color ?? size,
        map: input.chart_spec.chartProperties?.region ?? 'world',
        ...properties,
      };
    case 'map':
      warnings.push(issue(
        'approximated_chart',
        'Point Map uses longitude/latitude on a Cartesian scatter plane because VChart requires host-specific geographic projection registration.',
      ));
      return {
        ...base,
        type: 'scatter',
        xField: field(encodings, 'longitude'),
        yField: field(encodings, 'latitude'),
        seriesField: color,
        sizeField: size,
        ...properties,
      };
    case 'kpi':
      return {
        ...base,
        type: 'common',
        series: [{
          type: 'scatter',
          xField: field(encodings, 'metric') ?? '__flint_metric',
          yField: field(encodings, 'value'),
          seriesField: color,
          label: { visible: true },
        }],
        ...properties,
      };
    default:
      throw new Error(`No VChart compiler registered for ${template.chart}.`);
  }
}

function linearRegression(rows: DataRow[], xField: string, yField: string): DataRow[] {
  const points = rows
    .map(row => ({ x: Number(row[xField]), y: Number(row[yField]) }))
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2) return [];
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const slope = denominator === 0
    ? 0
    : points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  const domain = [Math.min(...points.map(point => point.x)), Math.max(...points.map(point => point.x))];
  return domain.map(value => ({
    [xField]: value,
    __flint_regression: intercept + slope * value,
  }));
}

function statistical(
  base: VChartSpec,
  kind: string,
  encodings: Encodings,
  rows: DataRow[],
  input: FlintInput,
  properties: Dict,
): VChartSpec {
  const x = field(encodings, 'x')!;
  const group = field(encodings, 'color', 'detail');
  const groups = new Map<unknown, number[]>();
  for (const row of rows) {
    const value = Number(row[x]);
    if (!Number.isFinite(value)) continue;
    const key = group ? row[group] : '';
    const values = groups.get(key) ?? [];
    values.push(value);
    groups.set(key, values);
  }
  const derived: DataRow[] = [];
  for (const [key, values] of groups) {
    values.sort((a, b) => a - b);
    if (kind === 'ecdf') {
      values.forEach((value, index) => derived.push({
        [x]: value,
        __flint_stat: (index + 1) / values.length,
        ...(group ? { [group]: key } : {}),
      }));
    } else {
      const bins = Math.max(8, Math.min(40, Math.ceil(Math.sqrt(values.length))));
      const min = values[0]!;
      const max = values.at(-1)!;
      const width = (max - min || 1) / bins;
      for (let index = 0; index < bins; index += 1) {
        const center = min + (index + 0.5) * width;
        const count = values.filter(value => value >= min + index * width && value < min + (index + 1) * width).length;
        derived.push({
          [x]: center,
          __flint_stat: count / (values.length * width),
          ...(group ? { [group]: key } : {}),
        });
      }
    }
  }
  const next = withDerivedData(base, derived);
  if (kind === 'violin') {
    return cartesian(next, 'area', { x: { field: x }, y: { field: '__flint_stat' }, ...(group ? { color: { field: group } } : {}) }, input, {
      seriesField: group,
      ...properties,
    });
  }
  return cartesian(next, kind === 'density' ? 'area' : 'line', {
    x: { field: x },
    y: { field: '__flint_stat' },
    ...(group ? { color: { field: group } } : {}),
  }, input, { seriesField: group, ...properties });
}

function network(base: VChartSpec, encodings: Encodings, rows: DataRow[], properties: Dict): VChartSpec {
  const source = field(encodings, 'x')!;
  const target = field(encodings, 'y')!;
  const value = field(encodings, 'size');
  const names = [...new Set(rows.flatMap(row => [String(row[source]), String(row[target])]))];
  const nodes = names.map(name => ({ name }));
  const links = rows.map(row => ({
    source: String(row[source]),
    target: String(row[target]),
    value: value ? row[value] : 1,
  }));
  return {
    ...withDerivedData(base, nodes, 'flintNodes'),
    type: 'sankey',
    data: [
      { id: 'flintNodes', values: nodes },
      { id: 'flintLinks', values: links },
    ],
    categoryField: 'name',
    sourceField: 'source',
    targetField: 'target',
    valueField: 'value',
    ...properties,
  };
}

function parallel(base: VChartSpec, encodings: Encodings, rows: DataRow[], properties: Dict): VChartSpec {
  const detail = field(encodings, 'detail');
  const measures = Object.keys(rows[0] ?? {}).filter(key =>
    key !== detail && rows.some(row => typeof row[key] === 'number'));
  const folded = rows.flatMap((row, rowIndex) => measures.map(measure => ({
    __flint_dimension: measure,
    __flint_value: row[measure],
    __flint_series: detail ? row[detail] : rowIndex,
  })));
  return {
    ...withDerivedData(base, folded),
    type: 'line',
    xField: '__flint_dimension',
    yField: '__flint_value',
    seriesField: '__flint_series',
    ...properties,
  };
}

function validateObject(input: unknown): ValidationResult {
  const errors: CompileWarning[] = [];
  const warnings: CompileWarning[] = [];
  if (!isObject(input)) return { valid: false, errors: [issue('invalid_input', 'Input must be an object.')], warnings };
  const candidate = input as unknown as FlintInput;
  if (!candidate.data || (!('values' in candidate.data) && !('url' in candidate.data))) {
    errors.push(issue('invalid_data', 'data must contain exactly one of values or url.', 'data'));
  } else if ('values' in candidate.data && 'url' in candidate.data) {
    errors.push(issue('invalid_data', 'data must contain either values or url, not both.', 'data'));
  } else if ('values' in candidate.data) {
    if (!Array.isArray(candidate.data.values) || candidate.data.values.length === 0) {
      errors.push(issue('invalid_data', 'data.values must be a non-empty array.', 'data.values'));
    } else if (candidate.data.values.length > 100_000) {
      errors.push(issue('too_many_rows', 'data.values exceeds Flint’s 100,000-row validation limit.', 'data.values'));
    } else if (candidate.data.values.some(row => !isObject(row))) {
      errors.push(issue('invalid_row', 'Every data row must be an object.', 'data.values'));
    }
  } else if (typeof candidate.data.url !== 'string' || !candidate.data.url) {
    errors.push(issue('invalid_url', 'data.url must be a non-empty string.', 'data.url'));
  }
  const chart = candidate.chart_spec;
  if (!isObject(chart) || typeof chart.chartType !== 'string') {
    errors.push(issue('missing_chart_type', 'chart_spec.chartType is required.', 'chart_spec.chartType'));
    return { valid: false, errors, warnings };
  }
  const template = getTemplate(chart.chartType);
  if (!template) errors.push(issue('unsupported_chart_type', `Unsupported Flint chart type: ${chart.chartType}`, 'chart_spec.chartType'));
  if (!isObject(chart.encodings) || Object.keys(chart.encodings).length === 0) {
    errors.push(issue('missing_encodings', 'chart_spec.encodings must bind at least one channel.', 'chart_spec.encodings'));
    return { valid: false, errors, warnings };
  }
  for (const sizeName of ['baseSize', 'canvasSize'] as const) {
    const size = chart[sizeName];
    if (!size) continue;
    if (
      !Number.isFinite(size.width) || !Number.isFinite(size.height) ||
      size.width <= 0 || size.height <= 0 ||
      size.width > 4000 || size.height > 4000
    ) {
      errors.push(issue(
        'invalid_size',
        `chart_spec.${sizeName} dimensions must be finite, positive, and at most 4000px.`,
        `chart_spec.${sizeName}`,
      ));
    }
  }
  if (template) {
    for (const channel of Object.keys(chart.encodings)) {
      if (!template.channels.includes(channel)) {
        errors.push(issue('unsupported_channel', `${channel} is not supported by ${template.chart}.`, `chart_spec.encodings.${channel}`));
      }
    }
    for (const channel of template.required) {
      if (!hasEncodingBinding(chart.encodings[channel])) {
        errors.push(issue('missing_channel', `${channel} is required for ${template.chart}.`, `chart_spec.encodings.${channel}`));
      }
    }
  }
  if (candidate.data && 'values' in candidate.data) {
    const fields = new Set((candidate.data.values ?? []).flatMap(row => Object.keys(row)));
    for (const [channel, value] of Object.entries(chart.encodings)) {
      for (const name of encodingFields(value)) {
        if (!fields.has(name)) errors.push(issue('missing_field', `Field "${name}" does not exist in data.values.`, `chart_spec.encodings.${channel}`));
      }
    }
  } else {
    warnings.push(issue('url_not_inspected', 'URL data cannot be inspected during synchronous compilation.', 'data.url'));
  }
  try {
    resolveThemeSpec(candidate.theme_spec);
  } catch (error) {
    errors.push(issue('invalid_theme', error instanceof Error ? error.message : String(error), 'theme_spec'));
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validateFlint(input: FlintInput): ValidationResult {
  return validateObject(input);
}

export function compileFlint(input: FlintInput): CompileResult {
  const validation = validateObject(input);
  if (!validation.valid) throw new Error(validation.errors.map(error => error.message).join(' '));
  const { encodings, rows } = normalize(input);
  collectCapabilityWarnings(input, validation.warnings);
  // Running the official assembler is a conformance guard: it executes Flint's
  // semantic, aggregation, layout and template-property pipeline and rejects
  // inputs that the selected upstream template cannot represent.
  if ('values' in input.data) {
    if (ecGetTemplateDef(input.chart_spec.chartType)) assembleECharts(input);
    else assembleVegaLite(input);
  }
  return {
    spec: compileTemplate(input, encodings, rows, validation.warnings),
    warnings: validation.warnings,
  };
}

export const flintToVChart = (input: FlintInput): VChartSpec => compileFlint(input).spec;

export function inferFieldType(input: FlintInput, name: string) {
  const annotation = input.semantic_types?.[name];
  const values = 'values' in input.data ? (input.data.values ?? []).map(row => row[name]) : [];
  return resolveFieldSemantics(annotation, name, values).defaultVisType;
}
