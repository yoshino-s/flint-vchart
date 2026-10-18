import type { CompileResult, CompileWarning, DataRow, FlintEncoding, FlintInput, FlintTheme, ValidationResult, VChartSpec } from './types.js';

const aliases: Record<string,string> = {
  'bar chart':'bar','grouped bar chart':'bar','stacked bar chart':'bar','diverging bar chart':'bar',
  'column chart':'bar','grouped column chart':'bar','stacked column chart':'bar','histogram':'histogram',
  'line chart':'line','multi-series line chart':'line','area chart':'area','stacked area chart':'area',
  'scatter plot':'scatter','bubble chart':'scatter','pie chart':'pie','donut chart':'pie','doughnut chart':'pie',
  'radar chart':'radar','rose chart':'rose','funnel chart':'funnel','heatmap':'heatmap','treemap':'treemap',
  'sunburst':'sunburst','box plot':'boxPlot','boxplot':'boxPlot','waterfall chart':'waterfall','range column chart':'rangeColumn'
};
const quantitative = /^(number|integer|float|double|decimal|currency|price|profit|revenue|sales|percentage|percent|ratio|count|rank|temperature|distance|duration|weight|height|size)/i;
const temporal = /^(date|time|datetime|year|month|day|quarter|week|yearmonth)/i;
const palettes: Record<string,string[]> = {
  default:['#1664FF','#1AC6FF','#FF8A00','#3CC780','#7442D4','#FFC400','#304D77','#B48DEB'],
  economist:['#E3120B','#0072B2','#6B6B6B','#F4A582','#92C5DE'],
  nyt:['#4E79A7','#F28E2B','#E15759','#76B7B2','#59A14F','#EDC948'],
  dark:['#669EFF','#62D4FF','#FFAB4C','#5CDB95','#A584E8','#FFD54F']
};
const enc = (input: FlintInput, channel: string): FlintEncoding | undefined => {
  const value=input.chart_spec.encodings[channel];
  return typeof value === 'string' ? {field:value} : value;
};
const field = (input: FlintInput, ...channels:string[]) => channels.map(c=>enc(input,c)?.field).find(Boolean);
const semantic = (input:FlintInput, f?:string) => {
  if (!f) return undefined; const x=input.semantic_types?.[f];
  return typeof x === 'string' ? x : x?.semanticType ?? x?.type;
};
function dataSpec(input:FlintInput) { return [{id:'flintData', values: 'values' in input.data ? (input.options?.cloneData === false ? input.data.values : input.data.values.map(r=>({...r}))) : input.data.url}]; }
function labels(input:FlintInput, f?:string) { return f ? input.field_display_names?.[f] ?? f : undefined; }
function theme(input:FlintInput): FlintTheme {
  if (typeof input.theme_spec === 'object') return input.theme_spec;
  const name=(input.theme_spec ?? 'default').toLowerCase();
  return {name,palette:palettes[name] ?? palettes.default,background:name==='dark'?'#17171A':'#fff',titleColor:name==='dark'?'#f2f3f5':'#1f2329',axisColor:name==='dark'?'#aaa':'#646a73',gridColor:name==='dark'?'#333':'#e5e6eb'};
}
function common(input:FlintInput):VChartSpec {
  const cs=input.chart_spec, t=theme(input), size=cs.canvasSize ?? cs.baseSize;
  return {
    ...(size?.width ? {width:size.width}:{}), ...(size?.height ? {height:size.height}:{}),
    data:dataSpec(input), background:t.background,
    ...(cs.title ? {title:{visible:true,text:cs.title,subtext:cs.subtitle,textStyle:{fill:t.titleColor,fontFamily:t.fontFamily}}}:{}),
    color:t.palette, padding:{top:20,right:20,bottom:20,left:20},
    axes:[{orient:'bottom',label:{style:{fill:t.axisColor}},grid:{visible:false}},{orient:'left',label:{style:{fill:t.axisColor}},grid:{visible:true,style:{stroke:t.gridColor}}}],
    ...cs.chartProperties
  };
}
function sortRows(rows:DataRow[], input:FlintInput):DataRow[] {
  for (const channel of Object.keys(input.chart_spec.encodings)) {
    const e=enc(input,channel); if (!e?.sortOrder || !e.field) continue;
    const dir=e.sortOrder==='ascending'?1:-1, by=e.sortBy ?? e.field;
    return [...rows].sort((a,b)=>String(a[by]??'').localeCompare(String(b[by]??''),undefined,{numeric:true})*dir);
  } return rows;
}
function build(input:FlintInput,type:string,warnings:CompileWarning[]):VChartSpec {
  const base=common(input), x=field(input,'x'), y=field(input,'y'), color=field(input,'color','group','series'), size=field(input,'size');
  if ('values' in input.data) base.data=[{...base.data[0],values:sortRows(base.data[0].values,input)}];
  const orient=input.chart_spec.chartProperties?.orient;
  switch(type) {
    case 'bar': return {...base,type:'bar',xField:orient==='horizontal'?y:x,yField:orient==='horizontal'?x:y,seriesField:color,stack:/stacked/i.test(input.chart_spec.chartType),direction:orient==='horizontal'?'horizontal':'vertical',axes:base.axes.map((a:any,i:number)=>({...a,title:{visible:true,text:labels(input,i?y:x)}}))};
    case 'line': case 'area': return {...base,type,xField:x,yField:y,seriesField:color,point:{visible:true},...(type==='area'?{stack:/stacked/i.test(input.chart_spec.chartType)}:{})};
    case 'scatter': return {...base,type:'scatter',xField:x,yField:y,seriesField:color,sizeField:size,size:size?[8,28]:10};
    case 'pie': return {...base,type:'pie',categoryField:x??color,valueField:y??field(input,'theta','value'),outerRadius:0.82,innerRadius:/donut|doughnut/i.test(input.chart_spec.chartType)?0.52:0,label:{visible:true}};
    case 'radar': return {...base,type:'radar',categoryField:x,valueField:y,seriesField:color};
    case 'rose': return {...base,type:'rose',categoryField:x,valueField:y,seriesField:color};
    case 'funnel': return {...base,type:'funnel',categoryField:x,valueField:y};
    case 'heatmap': return {...base,type:'heatmap',xField:x,yField:y,valueField:field(input,'color','value'),cell:{style:{shape:'rect'}}};
    case 'treemap': return {...base,type:'treemap',categoryField:x,valueField:y,seriesField:color};
    case 'sunburst': return {...base,type:'sunburst',categoryField:x,valueField:y};
    case 'boxPlot': return {...base,type:'boxPlot',xField:x,yField:y,seriesField:color};
    case 'waterfall': return {...base,type:'waterfall',xField:x,yField:y,seriesField:color};
    case 'rangeColumn': return {...base,type:'rangeColumn',xField:x,yField:[field(input,'y','min'),field(input,'y2','max')].filter(Boolean)};
    case 'histogram': warnings.push({code:'approximated_chart',message:'Histogram is emitted as a bin-enabled bar chart.'}); return {...base,type:'bar',xField:x,yField:y,bin:true};
    default: throw new Error(`Unsupported Flint chart type: ${input.chart_spec.chartType}`);
  }
}
export function validateFlint(input:FlintInput):ValidationResult {
  const errors:CompileWarning[]=[], warnings:CompileWarning[]=[];
  if (!input || typeof input!=='object') errors.push({code:'invalid_input',message:'Input must be an object.'});
  if (!input?.data || (!('values' in input.data)&&!('url' in input.data))) errors.push({code:'invalid_data',message:'data must contain values or url.',path:'data'});
  if (!input?.chart_spec?.chartType) errors.push({code:'missing_chart_type',message:'chart_spec.chartType is required.',path:'chart_spec.chartType'});
  if (!input?.chart_spec?.encodings || typeof input.chart_spec.encodings!=='object') errors.push({code:'missing_encodings',message:'chart_spec.encodings is required.',path:'chart_spec.encodings'});
  const key=input?.chart_spec?.chartType?.toLowerCase(); if (key && !aliases[key]) errors.push({code:'unsupported_chart_type',message:`Unsupported chart type: ${input.chart_spec.chartType}`});
  if (input?.chart_spec?.encodings) for(const [k,v] of Object.entries(input.chart_spec.encodings)) { const f=typeof v==='string'?v:v.field; if(!f) warnings.push({code:'empty_encoding',message:`Encoding ${k} has no field.`,path:`chart_spec.encodings.${k}`}); }
  return {valid:!errors.length,errors,warnings};
}
export function compileFlint(input:FlintInput):CompileResult {
  const validation=validateFlint(input); if(!validation.valid) throw new Error(validation.errors.map(e=>e.message).join(' '));
  const warnings=[...validation.warnings]; const type=aliases[input.chart_spec.chartType.toLowerCase()]!;
  return {spec:build(input,type,warnings),warnings};
}
/** Convenience API returning only the native VChart spec. */
export const flintToVChart=(input:FlintInput):VChartSpec=>compileFlint(input).spec;
/** Infer a VChart-friendly field role from Flint semantic metadata. */
export function inferFieldType(input:FlintInput,f:string) { const s=semantic(input,f); return temporal.test(s??'')?'temporal':quantitative.test(s??'')?'quantitative':'nominal'; }
