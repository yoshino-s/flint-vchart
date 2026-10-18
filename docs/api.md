# API

## `flintToVChart(input)`
Compiles a Flint input and returns a native VChart spec. Throws on malformed input or unsupported `chartType`.

## `compileFlint(input)`
Returns `{ spec, warnings }`. Warnings have `code`, `message`, and optionally `path`.

## `validateFlint(input)`
Returns `{ valid, errors, warnings }` without compiling.

## `inferFieldType(input, field)`
Uses Flint field semantics and returns `quantitative`, `temporal`, `ordinal`, or `nominal`.

## `supportedChartTypes`
The authoritative list of Flint templates supported by this backend.

## `FLINT_TEMPLATES`
Template metadata including accepted channels, required channels and VChart output strategy.

All public input/output types are exported from the package root. `FlintInput`
is derived from the `flint-chart@0.5.1` `ChartAssemblyInput` contract.
