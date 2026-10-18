import type {
  AssembleOptions,
  ChartAssemblyInput,
  ChartEncoding,
  ChartWarning,
  RawEncodingValue,
  SemanticAnnotation,
  ThemeSpec,
} from 'flint-chart';

export interface FlintInteractionEntry {
  type: string;
  id?: string;
  options?: Record<string, unknown>;
}

export interface FlintInteractionSpec {
  interactions: readonly FlintInteractionEntry[];
  assistedTargeting?: boolean | Record<string, unknown>;
  keyboardTargeting?: boolean;
}

/**
 * The published 0.5.1 contract plus the interaction_spec already present on
 * the upstream main branch. Keeping it optional remains source-compatible.
 */
export type FlintInput = ChartAssemblyInput & { interaction_spec?: FlintInteractionSpec };
export type FlintChartSpec = FlintInput['chart_spec'];
export type FlintEncoding = ChartEncoding;
export type FlintEncodingValue = RawEncodingValue;
export type FlintTheme = ThemeSpec;
export type FlintAssembleOptions = AssembleOptions;
export type FlintSemanticAnnotation = SemanticAnnotation;
export type DataRow = Record<string, unknown>;

/** VChart single-chart or common multi-series specification. */
export type VChartSpec = Record<string, any>;

export interface CompileWarning {
  code: string;
  message: string;
  path?: string;
}

export interface CompileResult {
  spec: VChartSpec;
  warnings: CompileWarning[];
}

export interface ValidationResult {
  valid: boolean;
  errors: CompileWarning[];
  warnings: CompileWarning[];
}

export interface TemplateDefinition {
  chart: string;
  channels: readonly string[];
  required: readonly string[];
  output: string;
}

export type FlintChartWarning = ChartWarning;
