# flint-vchart

[![CI](https://github.com/yoshino-s/flint-vchart/actions/workflows/ci.yml/badge.svg)](https://github.com/yoshino-s/flint-vchart/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/flint-vchart)](https://www.npmjs.com/package/flint-vchart) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A typed, dependency-light compiler that turns [Microsoft Flint](https://github.com/microsoft/flint-chart) semantic chart inputs into native [VisActor VChart](https://visactor.io/vchart) specifications. It is not affiliated with Microsoft or VisActor.

## Install

```bash
npm install flint-vchart @visactor/vchart
```

## Usage

```ts
import VChart from '@visactor/vchart';
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
    encodings: { x: 'month', y: 'sales', color: 'region' }
  }
});
new VChart(spec, { dom: 'chart' }).renderSync();
```

Use `compileFlint(input)` when warnings are needed and `validateFlint(input)` for validation without compilation.

## Supported templates

Bar/column (grouped, stacked and diverging aliases), line, area, scatter/bubble, pie/donut, radar, rose, funnel, heatmap, treemap, sunburst, box plot, waterfall, range column and histogram. Unknown chart types fail explicitly rather than silently producing a wrong chart.

## Flint compatibility

Supports inline and URL data, string/object encodings, semantic types, display names, titles/subtitles, base/canvas size, chart properties, common sort options and compact themes (`default`, `economist`, `nyt`, `dark`, or an object). Flint is evolving; backend-specific interactions and every upstream template are not yet supported. See [compatibility](docs/compatibility.md) and [API](docs/api.md).

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
