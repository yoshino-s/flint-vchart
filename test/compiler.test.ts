import { describe, expect, it } from 'vitest';
import { Factory } from '@visactor/vchart';
import { ecAllTemplateDefs, vlAllTemplateDefs, type ChartAssemblyInput } from 'flint-chart';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import {
  FLINT_TEMPLATES, compileFlint, flintToVChart, inferFieldType,
  supportedChartTypes, validateFlint, type FlintInput,
} from '../src';

type Fixture = ReturnType<(typeof TEST_GENERATORS)[string]>[number];

function fixtureInput(test: Fixture): FlintInput {
  const encodings: Record<string, any> = {};
  for (const [channel, value] of Object.entries(test.encodingMap ?? {})) {
    if (!value?.fieldID) continue;
    encodings[channel] = {
      field: value.fieldID,
      ...(value.dtype ? { type: value.dtype } : {}),
      ...(value.aggregate ? { aggregate: value.aggregate } : {}),
      ...(value.sortOrder ? { sortOrder: value.sortOrder } : {}),
      ...(value.sortBy ? { sortBy: value.sortBy } : {}),
      ...(value.scheme ? { scheme: value.scheme } : {}),
    };
  }
  const semanticTypes = Object.fromEntries(
    Object.entries(test.metadata ?? {}).map(([name, metadata]) => [
      name, test.semanticAnnotations?.[name] ?? metadata.semanticType,
    ]),
  );
  return {
    data: { values: test.data },
    semantic_types: semanticTypes,
    chart_spec: {
      chartType: test.chartType, title: test.title, encodings,
      chartProperties: test.chartProperties,
    },
    options: test.assembleOptions,
  } as FlintInput;
}

const synthetic: Record<string, FlintInput> = {
  'Funnel Chart': {
    data: { values: [{ stage: 'Visit', value: 100 }, { stage: 'Buy', value: 20 }] },
    chart_spec: { chartType: 'Funnel Chart', encodings: { y: 'stage', size: 'value' } },
  },
  Treemap: {
    data: { values: [{ category: 'A', value: 10 }] },
    chart_spec: { chartType: 'Treemap', encodings: { color: 'category', size: 'value' } },
  },
  'Sunburst Chart': {
    data: { values: [{ group: 'G', category: 'A', value: 10 }] },
    chart_spec: { chartType: 'Sunburst Chart', encodings: { group: 'group', color: 'category', size: 'value' } },
  },
  Tree: {
    data: { values: [{ parent: 'Root', node: 'A', value: 10 }] },
    chart_spec: { chartType: 'Tree', encodings: { color: 'parent', detail: 'node', size: 'value' } },
  },
  'Parallel Coordinates': {
    data: { values: [{ id: 'A', speed: 1, cost: 2 }, { id: 'B', speed: 2, cost: 1 }] },
    chart_spec: { chartType: 'Parallel Coordinates', encodings: { detail: 'id' } },
  },
  'Gauge Chart': {
    data: { values: [{ value: 72 }] },
    chart_spec: { chartType: 'Gauge Chart', encodings: { size: 'value' } },
  },
  'Sankey Diagram': {
    data: { values: [{ source: 'A', target: 'B', value: 4 }] },
    chart_spec: { chartType: 'Sankey Diagram', encodings: { x: 'source', y: 'target', size: 'value' } },
  },
  'Network Graph': {
    data: { values: [{ source: 'A', target: 'B', weight: 4 }] },
    chart_spec: { chartType: 'Network Graph', encodings: { x: 'source', y: 'target', size: 'weight' } },
  },
};

function representative(chart: string): FlintInput {
  const fixture = TEST_GENERATORS[chart]?.()[0];
  return fixture ? fixtureInput(fixture) : synthetic[chart]!;
}

describe('Flint 0.5.1 conformance', () => {
  it('tracks the union of the upstream public template registries', () => {
    const upstream = new Set([
      ...vlAllTemplateDefs.map(item => item.chart),
      ...ecAllTemplateDefs.map(item => item.chart),
    ]);
    expect(new Set(supportedChartTypes)).toEqual(upstream);
    expect(FLINT_TEMPLATES).toHaveLength(upstream.size);
  });

  it.each(supportedChartTypes)('compiles a representative %s input', chart => {
    const result = compileFlint(representative(chart));
    expect(result.spec.type).toBeTruthy();
    expect(result.spec.data).toBeTruthy();
    const transformer = Factory.createChartSpecTransformer(result.spec.type, {});
    expect(transformer, `VChart transformer for ${result.spec.type}`).toBeTruthy();
    expect(() => transformer!.transformSpec(result.spec)).not.toThrow();
  });

  it('compiles every official gallery fixture for every supported template', () => {
    let count = 0;
    for (const chart of supportedChartTypes) {
      for (const fixture of TEST_GENERATORS[chart]?.() ?? []) {
        expect(() => compileFlint(fixtureInput(fixture)), `${chart}: ${fixture.title}`).not.toThrow();
        count += 1;
      }
    }
    expect(count).toBeGreaterThanOrEqual(300);
  });

  it('normalizes static-series arrays through Flint core', () => {
    const spec = flintToVChart({
      data: { values: [{ month: 'Jan', sales: 10, profit: 3 }] },
      semantic_types: { month: 'Month', sales: 'Amount', profit: 'Amount' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: 'month', y: ['sales', 'profit'] },
      },
    });
    expect(spec.seriesField).toBe('__flint_series_key');
    expect(spec.data[0].values).toHaveLength(2);
  });

  it('executes aggregate encodings', () => {
    const spec = flintToVChart({
      data: { values: [{ category: 'A', value: 2 }, { category: 'A', value: 3 }] },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: 'category', y: { field: 'value', aggregate: 'sum' } },
      },
    });
    expect(spec.data[0].values).toEqual([{ category: 'A', value: 5 }]);
  });

  it('supports fieldless count aggregation', () => {
    const spec = flintToVChart({
      data: { values: [{ category: 'A' }, { category: 'A' }, { category: 'B' }] },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: 'category', y: { aggregate: 'count' } },
      },
    });
    expect(spec.yField).toBe('__flint_count');
    expect(spec.data[0].values).toEqual([
      { category: 'A', __flint_count: 2 },
      { category: 'B', __flint_count: 1 },
    ]);
  });

  it('sorts inline rows using Flint encoding sort semantics', () => {
    const spec = flintToVChart({
      data: { values: [{ category: 'A', value: 2 }, { category: 'B', value: 5 }] },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: {
          x: { field: 'category', sortBy: 'y', sortOrder: 'descending' },
          y: 'value',
        },
      },
    });
    expect(spec.data[0].values.map((row: any) => row.category)).toEqual(['B', 'A']);
  });

  it('validates channels and referenced columns using Flint template rules', () => {
    const result = validateFlint({
      data: { values: [{ category: 'A' }] },
      chart_spec: { chartType: 'Pie Chart', encodings: { x: 'missing' } },
    } as FlintInput);
    expect(result.valid).toBe(false);
    expect(result.errors.map(error => error.code)).toEqual(
      expect.arrayContaining(['unsupported_channel', 'missing_field']),
    );
  });

  it('uses Flint semantic resolution', () => {
    const input: FlintInput = {
      data: { values: [{ date: '2026-01-01', amount: 1 }] },
      semantic_types: { date: 'Date', amount: 'Revenue' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'date', y: 'amount' } },
    };
    expect(inferFieldType(input, 'date')).toBe('temporal');
    expect(inferFieldType(input, 'amount')).toBe('quantitative');
  });

  it('maps Flint interaction presets to VChart components', () => {
    const input = representative('Bar Chart');
    input.interaction_spec = {
      interactions: [
        { type: 'select' }, { type: 'legend-toggle' },
        { type: 'navigate' }, { type: 'inspect-index' },
      ],
    };
    const spec = flintToVChart(input);
    expect(spec.select.enable).toBe(true);
    expect(spec.legends[0].interactive).toBe(true);
    expect(spec.dataZoom[0]).toBeTruthy();
    expect(spec.crosshair.xField.visible).toBe(true);
  });

  it('reports every intentional compatibility degradation', () => {
    const input = representative('Line Chart');
    input.chart_spec.encodings.column = 'region';
    if (!('values' in input.data) || !input.data.values) throw new Error('fixture must use inline data');
    input.data.values = input.data.values.map(row => ({ ...row, region: 'A' }));
    input.theme_spec = 'nyt';
    input.chart_spec.chartProperties = { interpolate: 'monotone' };
    input.interaction_spec = { interactions: [{ type: 'drag-reorder' }] };
    const codes = compileFlint(input).warnings.map(warning => warning.code);
    expect(codes).toEqual(expect.arrayContaining([
      'theme_partially_realized',
      'approximated_chart_property',
      'approximated_interaction',
      'faceting_flattened',
    ]));
  });

  it('accepts URL data and reports that fields cannot be inspected', () => {
    const input: ChartAssemblyInput = {
      data: { url: 'https://example.com/data.json' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'category', y: 'value' } },
    };
    const result = compileFlint(input);
    expect(result.warnings.map(warning => warning.code)).toContain('url_not_inspected');
    expect(result.spec.data[0].values).toEqual([]);
    expect(result.spec.__flintDataUrl).toBe(input.data.url);
  });
});
