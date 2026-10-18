# API

## `flintToVChart(input)`
Compiles a Flint input and returns a native VChart spec. Throws on malformed input or unsupported `chartType`.

## `compileFlint(input)`
Returns `{ spec, warnings }`. Warnings have `code`, `message`, and optionally `path`.

## `validateFlint(input)`
Returns `{ valid, errors, warnings }` without compiling.

## `inferFieldType(input, field)`
Maps semantic metadata to `quantitative`, `temporal`, or `nominal`.

All public input/output types are exported from the package root: `FlintInput`, `FlintChartSpec`, `FlintEncoding`, `FlintTheme`, `CompileResult`, and others.
