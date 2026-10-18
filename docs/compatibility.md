# Compatibility

| Flint feature | VChart output |
|---|---|
| `data.values`, `data.url` | `data.values`, `data.url` |
| `x`, `y`, `color/group/series`, `size` | corresponding VChart field properties |
| title and subtitle | VChart title component |
| `baseSize` / `canvasSize` | explicit width and height (canvas wins) |
| `field_display_names` | axis labels where applicable |
| `sortOrder`, `sortBy` | stable inline-data ordering |
| named/custom compact themes | background, palette, axis/title styling |
| arbitrary `chartProperties` | merged into the generated top-level spec |

Aggregation is currently passed through only where native templates support it; pre-aggregate complex datasets. Flint interaction specifications and formal upstream ThemeSpec inheritance are intentionally out of scope for 0.1.
