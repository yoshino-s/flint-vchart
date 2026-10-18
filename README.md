# flint-vchart

[![CI](https://github.com/yoshino-s/flint-vchart/actions/workflows/ci.yml/badge.svg)](https://github.com/yoshino-s/flint-vchart/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/flint-vchart)](https://www.npmjs.com/package/flint-vchart) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A typed compiler that turns [Microsoft Flint](https://github.com/microsoft/flint-chart) semantic chart inputs into native [VisActor VChart](https://visactor.io/vchart) specifications. The compatibility contract is pinned to `flint-chart@0.5.1`. It is not affiliated with Microsoft or VisActor.

## Install

```bash
npm install flint-vchart @visactor/vchart
```

## Usage

```ts
import { VChart } from '@visactor/vchart';
import { flintToVChart } from 'flint-vchart';

const spec = flintToVChart({
  data: { values: [
    { month: 'Jan', sales: 12, region: 'East' },
    { month: 'Feb', sales: 19, region: 'West' }
  ]},
  semantic_types: { month: 'YearMonth', sales: 'Revenue' },
  chart_spec: {
    chartType: 'Grouped Bar Chart',
    title: 'Revenue',
    encodings: { x: 'month', y: 'sales', group: 'region' }
  }
});
new VChart(spec, { dom: 'chart' }).renderSync();
```

Use `compileFlint(input)` when warnings are needed and `validateFlint(input)` for validation without compilation.

## Supported templates

The compiler tracks the union of the public `flint-chart@0.5.1` Vega-Lite and ECharts registries: 44 templates including statistical, interval, hierarchy, geo, flow, indicator, table and KPI templates. Read `supportedChartTypes` or `FLINT_TEMPLATES` at runtime for the authoritative list. Unknown chart types fail explicitly.

## Flint compatibility

The public input type is derived directly from `flint-chart@0.5.1`. Flint core performs shorthand/static-series normalization, temporal conversion, semantic resolution, theme inheritance and an upstream assembly conformance check. The VChart backend accepts all public templates and channels, performs aggregation, maps common theme/interaction/property semantics, and reports explicit diagnostics where VChart requires approximation or host setup. See [compatibility](docs/compatibility.md) and [API](docs/api.md).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run demo       # http://localhost:5173
npm pack --dry-run
```

## Publishing

1. Replace `yoshino-s` URLs in `package.json`, README and demo.
2. Create an npm trusted publisher for the GitHub repository.
3. Update `CHANGELOG.md`, then run `npm version patch|minor|major`.
4. Push the tag or run the **Publish npm** workflow with a version matching `package.json`.

GitHub Pages deploys automatically from `main`. Releases tagged `v*` publish through npm provenance. Package access is public.

## License

[MIT](LICENSE)
