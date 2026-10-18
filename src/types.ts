/** Flint-compatible input accepted by the compiler. */
export interface FlintInput {
  data: { values: DataRow[] } | { url: string };
  semantic_types?: Record<string, SemanticType | SemanticAnnotation>;
  field_display_names?: Record<string, string>;
  chart_spec: FlintChartSpec;
  theme_spec?: string | FlintTheme;
  options?: CompileOptions;
}
export type DataRow = Record<string, unknown>;
export type SemanticType = string;
export interface SemanticAnnotation { semanticType?: string; type?: string; unit?: string; format?: string }
export interface FlintChartSpec {
  chartType: string; title?: string; subtitle?: string;
  encodings: Record<string, FlintEncoding | string>;
  baseSize?: { width: number; height: number };
  canvasSize?: { width: number; height: number };
  chartProperties?: Record<string, unknown>;
}
export interface FlintEncoding {
  field?: string; type?: 'quantitative'|'nominal'|'ordinal'|'temporal';
  aggregate?: 'count'|'sum'|'average'|'mean'; sortOrder?: 'ascending'|'descending';
  sortBy?: string; scheme?: string;
}
export interface FlintTheme {
  name?: string; background?: string; fontFamily?: string; palette?: string[];
  titleColor?: string; axisColor?: string; gridColor?: string;
}
export interface CompileOptions { strict?: boolean; cloneData?: boolean }
export type VChartSpec = Record<string, any>;
export interface CompileWarning { code: string; message: string; path?: string }
export interface CompileResult { spec: VChartSpec; warnings: CompileWarning[] }
export interface ValidationResult { valid: boolean; errors: CompileWarning[]; warnings: CompileWarning[] }
