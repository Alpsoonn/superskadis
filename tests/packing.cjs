// Run with node tests/packing.cjs. Exercise the production packing functions.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const context=vm.createContext({performance,console,THREE:{MathUtils:{degToRad:value=>value*Math.PI/180}},nextFrame:()=>Promise.resolve(),PACKING_ANGLES:[0,45,90,135,180,225,270,315],formatMillimetres:String});
vm.runInContext(source.slice(source.indexOf('function polygonArea('),source.indexOf('async function generateBuildPlates(')),context);
const inside=source.match(/function pointInsidePolygon\([^\n]+/)[0];
vm.runInContext(inside,context);
vm.runInContext('var calls=0; const originalFind=findPlacement; findPlacement=(...args)=>{calls++;return originalFind(...args);}',context);
function items(file,hull,count){return Array.from({length:count},(_,id)=>({id:`${file}-${id}`,part:{file,name:file},hull,area:context.polygonArea(hull)}));}
function rectangle(w,h){return [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];}
async function run(label,input,options,expected){
  context.calls=0;const start=performance.now();
  const plates=await context.packItemGroup(input,label.includes('connectors')?'connections':'structural',options,0,4);
  assert.equal(plates.flatMap(p=>p.placements).length,input.length);
  assert.equal(new Set(plates.flatMap(p=>p.placements.map(x=>x.item.id))).size,input.length);
  if(expected!==undefined)assert.equal(plates.length,expected);
  for(const plate of plates){
    for(const placement of plate.placements)assert(context.placementFits(placement,plate,options,placement));
    const bounds=context.boundsForPoints(plate.placements.flatMap(p=>p.points));
    assert(Math.abs(bounds.minX+bounds.maxX)<1e-6);assert(Math.abs(bounds.minY+bounds.maxY)<1e-6);
  }
  const unique=context.groupRepeatedPlates(plates);
  assert.equal(unique.reduce((sum,p)=>sum+p.multiplier*p.placements.length,0),input.length);
  console.log(`${label}: ${plates.length} plates, ${context.calls} searches, ${(performance.now()-start).toFixed(0)} ms`);
  return plates;
}
(async()=>{
  const options={width:256,depth:256,spacing:3,brim:3};
  await run('100 large panels',items('square',rectangle(198,198),100),options,100);
  assert(context.calls<=2,'Repeated solitary panels should reuse the empty-bed search');
  await run('Mixed sizes',[...items('square',rectangle(198,198),10),...items('small',rectangle(20,20),20)],options);
  await run('Triangles',items('triangle',[{x:0,y:0},{x:180,y:0},{x:0,y:180}],12),options);
  await run('200 connectors',items('connector',rectangle(8,3),200),options,1);
  await run('Rectangular bed',items('panel',rectangle(198,198),8),{...options,width:450},4);
  await assert.rejects(()=>run('Too large',items('oversize',rectangle(400,400),1),options),/does not fit/);
})().catch(error=>{console.error(error);process.exitCode=1;});
