import {describe,expect,it} from 'vitest'; import {compileFlint,flintToVChart,inferFieldType,validateFlint,type FlintInput} from '../src';
const input:FlintInput={data:{values:[{month:'Jan',sales:10,region:'East'},{month:'Feb',sales:20,region:'West'}]},semantic_types:{month:'YearMonth',sales:'Revenue'},field_display_names:{sales:'Net sales'},chart_spec:{chartType:'Bar Chart',title:'Sales',encodings:{x:'month',y:{field:'sales',sortOrder:'descending'},color:'region'},baseSize:{width:600,height:360}}};
describe('compiler',()=>{
 it('converts bar charts',()=>{const {spec,warnings}=compileFlint(input); expect(spec).toMatchObject({type:'bar',xField:'month',yField:'sales',seriesField:'region',width:600,height:360}); expect(spec.data[0].values).toHaveLength(2); expect(warnings).toEqual([])});
 it.each([['Line Chart','line'],['Area Chart','area'],['Scatter Plot','scatter'],['Pie Chart','pie'],['Donut Chart','pie'],['Heatmap','heatmap'],['Treemap','treemap'],['Waterfall Chart','waterfall']])('maps %s', (chartType,type)=>expect(flintToVChart({...input,chart_spec:{...input.chart_spec,chartType}}).type).toBe(type));
 it('validates',()=>expect(validateFlint({} as FlintInput).valid).toBe(false));
 it('rejects unsupported chart types',()=>expect(()=>flintToVChart({...input,chart_spec:{...input.chart_spec,chartType:'Magic'}})).toThrow(/Unsupported/));
 it('infers semantics',()=>{expect(inferFieldType(input,'sales')).toBe('quantitative');expect(inferFieldType(input,'month')).toBe('temporal')});
 it('creates donut radius',()=>expect(flintToVChart({...input,chart_spec:{...input.chart_spec,chartType:'Donut Chart'}}).innerRadius).toBe(.52));
});
