# Compatibility

Compatibility baseline: `flint-chart@0.5.1`.

| Flint feature | VChart output |
|---|---|
| `data.values` | VChart inline data source |
| `data.url` | empty VChart data source plus `__flintDataUrl`; host loads and updates it |
| string/object/array encodings | normalized encoding and static-series fold |
| all public Flint channels | native fields or template-specific transforms |
| `sum`, `count`, `average`, `mean` | compiler-side aggregation |
| semantic annotations | Flint core semantic and temporal resolution |
| title and subtitle | VChart title component |
| `baseSize` / `canvasSize` | explicit width and height (canvas wins) |
| `field_display_names` | axis labels where applicable |
| named/custom `ThemeSpec` | Flint preset inheritance plus VChart palette/surface/headline realization; diagnostic for remaining policies |
| `interaction_spec` | common VChart hover/select/legend/zoom/brush/crosshair mappings; diagnostic otherwise |
| template properties | allowlisted VChart equivalents; diagnostic otherwise |

The template registry is asserted against the union of Flint's public Vega-Lite
and ECharts registries in CI. Every official gallery fixture is compiled in the
test suite. Templates without a one-to-one VChart chart use common multi-series
specifications or deterministic data transforms.

URL sources cannot be fetched by this synchronous compiler. Their URL is retained
as `__flintDataUrl`, output data starts empty, and `url_not_inspected` is emitted.
The host must fetch/parse the file and call VChart's data update API. Inline
sources receive strict channel, required-field and column validation.

`Network Graph` and `Parallel Coordinates` have no direct VChart 1.x chart type
and are represented as Sankey and folded multi-series line views respectively;
the compiler emits `approximated_chart`. Choropleths require the host to register
matching GeoJSON and emit `map_registration_required`. Facet channels are
currently flattened into series with `faceting_flattened`. These are accepted
Flint inputs with explicit, inspectable degradation—not silent equivalence.
