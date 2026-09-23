import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const parts = window.SKADIS_PARTS || [];
const state = { selection: new Set(), models: new Map(), skipUnnecessaryHardware: true, avoidImpossibleConnections: true, measureMode: false };
const count = document.querySelector('#build-count'); const dropZone = document.querySelector('#drop-zone');
const bomPanelsList = document.querySelector('#bom-panels-list'); const bomConnectionsList = document.querySelector('#bom-connections-list');
const bomPanelCount = document.querySelector('#bom-panel-count'); const bomConnectionCount = document.querySelector('#bom-connection-count'); const bomTotalCount = document.querySelector('#bom-total-count');
const skipUnnecessaryHardware = document.querySelector('#skip-unnecessary-hardware');
const avoidImpossibleConnections = document.querySelector('#avoid-impossible-connections');
const measureTool = document.querySelector('#measure-tool'); const clearMeasurements = document.querySelector('#clear-measurements');
const measureStatus = document.querySelector('#measure-status'); const measurementLayer = document.querySelector('#measurement-layer');
const connectionWarningLayer=document.querySelector('#connection-warning-layer');
const connectionWarningArrows=new Map();

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true;
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-4,4,3,-3,.1,100); camera.position.set(0,0,10);
const controls = new OrbitControls(camera, canvas); controls.target.set(0,0,0); controls.enableDamping=true; controls.enableRotate=false; controls.enablePan=false; controls.enableZoom=false; controls.minZoom=.15; controls.maxZoom=20; controls.zoomSpeed=1.25;
scene.add(new THREE.HemisphereLight(0xffffff,0x71847d,2.6)); const light=new THREE.DirectionalLight(0xffffff,3); light.position.set(-4,7,5); light.castShadow=true; scene.add(light);
const placed = new THREE.Group(); scene.add(placed); const loader=new STLLoader(); const raycaster=new THREE.Raycaster(); const pointer=new THREE.Vector2();
const STL_UNIT_SCALE = 0.01;
const GRID_STEP_MM = 200;
const GRID_ROTATION = Math.PI/4;
const GRID_VERTEX_RADIUS_MM = GRID_STEP_MM/Math.SQRT2;
const MEASUREMENT_GRID_MM = 20;
const MEASUREMENT_GRID_STEP = MEASUREMENT_GRID_MM*STL_UNIT_SCALE;
const PANEL_COLOR = 0xf46f47;
const COLLISION_COLOR = 0xe55252;
const COLLISION_EPSILON = .5*STL_UNIT_SCALE;
const RING_THUMBNAIL_EXTENT = 8.2*STL_UNIT_SCALE;
const MODEL_ORIGINS_MM = {
  'main square.stl': [0, 0],
  '180 horizontal.stl': [0, 0],
  '180 vertical.stl': [-280, 280],
  '90 horizontal.stl': [-280, 0],
  '90 horizontal rounded.stl': [-280, 0],
  '90 vertical.stl': [-280, 560],
  '90 vertical rounded.stl': [-280, 560],
  'ring 1-8.stl': [100, 0],
  'ring 2-8.stl': [100, 0],
  'ring 3-8.stl': [100, 0],
  'ring 4-8.stl': [100, 0],
  'ring 5-8.stl': [100, 0],
  'ring 6-8.stl': [100, 0],
  'ring 7-8.stl': [100, 0],
  'ring 8-8.stl': [100, 0]
};
const PANEL_POLYGONS_MM = {
  'main square.stl': [[0,GRID_VERTEX_RADIUS_MM],[-GRID_VERTEX_RADIUS_MM,0],[0,-GRID_VERTEX_RADIUS_MM],[GRID_VERTEX_RADIUS_MM,0]],
  '180 horizontal.stl': [[-GRID_VERTEX_RADIUS_MM,0],[GRID_VERTEX_RADIUS_MM,0],[0,GRID_VERTEX_RADIUS_MM]],
  '180 vertical.stl': [[0,-GRID_VERTEX_RADIUS_MM],[GRID_VERTEX_RADIUS_MM,0],[0,GRID_VERTEX_RADIUS_MM]],
  '90 horizontal.stl': [[0,0],[GRID_VERTEX_RADIUS_MM,0],[0,GRID_VERTEX_RADIUS_MM]],
  '90 horizontal rounded.stl': [[0,0],[GRID_VERTEX_RADIUS_MM,0],[0,GRID_VERTEX_RADIUS_MM]],
  '90 vertical.stl': [[0,-GRID_VERTEX_RADIUS_MM],[GRID_VERTEX_RADIUS_MM,0],[0,0]],
  '90 vertical rounded.stl': [[0,-GRID_VERTEX_RADIUS_MM],[GRID_VERTEX_RADIUS_MM,0],[0,0]]
};
const MAIN_SQUARE_EDGE_PORTS_MM = [
  [20, 120], [40, 100], [60, 80], [80, 60], [100, 40], [120, 20]
];
const PANEL_CONNECTION_EDGES = {
  northEast: { id:'north-east', normal:[1,1], points:MAIN_SQUARE_EDGE_PORTS_MM.map(([x,y])=>[x,y]) },
  northWest: { id:'north-west', normal:[-1,1], points:MAIN_SQUARE_EDGE_PORTS_MM.map(([x,y])=>[-x,y]) },
  southWest: { id:'south-west', normal:[-1,-1], points:MAIN_SQUARE_EDGE_PORTS_MM.map(([x,y])=>[-x,-y]) },
  southEast: { id:'south-east', normal:[1,-1], points:MAIN_SQUARE_EDGE_PORTS_MM.map(([x,y])=>[x,-y]) }
};
const CONNECTION_PORTS = {
  'main square.stl': [PANEL_CONNECTION_EDGES.northEast,PANEL_CONNECTION_EDGES.northWest,PANEL_CONNECTION_EDGES.southWest,PANEL_CONNECTION_EDGES.southEast],
  '180 horizontal.stl': [PANEL_CONNECTION_EDGES.northEast,PANEL_CONNECTION_EDGES.northWest],
  '180 vertical.stl': [PANEL_CONNECTION_EDGES.northEast,PANEL_CONNECTION_EDGES.southEast],
  '90 horizontal.stl': [PANEL_CONNECTION_EDGES.northEast],
  '90 horizontal rounded.stl': [PANEL_CONNECTION_EDGES.northEast],
  '90 vertical.stl': [PANEL_CONNECTION_EDGES.southEast],
  '90 vertical rounded.stl': [PANEL_CONNECTION_EDGES.southEast]
};
function createGuideGrid(){ const step=GRID_STEP_MM*STL_UNIT_SCALE; const halfSize=100; const vertices=[]; for(let offset=-halfSize+step/2;offset<halfSize;offset+=step){ vertices.push(-halfSize,offset,0,halfSize,offset,0,offset,-halfSize,0,offset,halfSize,0); } const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); const material=new THREE.LineBasicMaterial({color:0x5e746d,transparent:true,opacity:.34,depthWrite:false}); const grid=new THREE.LineSegments(geometry,material); grid.rotation.z=GRID_ROTATION; grid.position.z=-.05; grid.renderOrder=-1; return grid; }
scene.add(createGuideGrid());
function createMeasurementGrid(){ const halfSize=100; const vertices=[]; for(let offset=-halfSize;offset<=halfSize;offset+=MEASUREMENT_GRID_STEP){ vertices.push(-halfSize,offset,0,halfSize,offset,0,offset,-halfSize,0,offset,halfSize,0); } const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); const material=new THREE.LineBasicMaterial({color:0xb6da42,transparent:true,opacity:.12,depthTest:false,depthWrite:false}); const grid=new THREE.LineSegments(geometry,material); grid.rotation.z=GRID_ROTATION; grid.position.z=.68; grid.renderOrder=4; grid.visible=false; return grid; }
const measurementGrid=createMeasurementGrid(); scene.add(measurementGrid);
const measurementGuides=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xffffff,transparent:true,opacity:.48,dashSize:.09,gapSize:.055,depthTest:false,depthWrite:false})); measurementGuides.renderOrder=6; measurementGuides.frustumCulled=false; measurementGuides.visible=false; scene.add(measurementGuides);
function snapToGridCellCenter(part,position){ if(!part||!['Structure','Angle'].includes(part.category))return position; const step=GRID_STEP_MM*STL_UNIT_SCALE; const cos=Math.cos(-GRID_ROTATION); const sin=Math.sin(-GRID_ROTATION); const localX=position.x*cos-position.y*sin; const localY=position.x*sin+position.y*cos; const snappedX=Math.round(localX/step)*step; const snappedY=Math.round(localY/step)*step; const worldCos=Math.cos(GRID_ROTATION); const worldSin=Math.sin(GRID_ROTATION); return new THREE.Vector3(snappedX*worldCos-snappedY*worldSin,snappedX*worldSin+snappedY*worldCos,position.z); }
function getOrientationVector(mesh){ if(mesh.geometry.userData.orientationVector)return mesh.geometry.userData.orientationVector; mesh.geometry.computeBoundingBox(); const center=new THREE.Vector3(); mesh.geometry.boundingBox.getCenter(center); const direction=new THREE.Vector2(center.x,center.y); if(direction.lengthSq()>1e-8)direction.normalize(); mesh.geometry.userData.orientationVector=direction; return direction; }
function placeMeshOnGrid(mesh,desiredPosition,allowInvalidPreview=false){
  const previousPosition=mesh.position.clone();
  const previousRotation=mesh.rotation.z;
  const snappedPosition=snapToGridCellCenter(mesh.userData.part,desiredPosition);
  if(mesh.userData.part.category==='Angle'){
    const direction=getOrientationVector(mesh);
    const intentX=desiredPosition.x-snappedPosition.x;
    const intentY=desiredPosition.y-snappedPosition.y;
    const orientationIntent=intentX*direction.x+intentY*direction.y;
    if(Math.abs(orientationIntent)>.04)mesh.rotation.z=orientationIntent>0?0:Math.PI;
  }
  mesh.position.copy(snappedPosition);
  const valid=!hasPanelCollision(mesh);
  mesh.userData.placementValid=valid;
  if(!valid&&!allowInvalidPreview){
    mesh.position.copy(previousPosition);
    mesh.rotation.z=previousRotation;
    mesh.userData.placementValid=true;
  }
  if(mesh.material?.color)mesh.material.color.setHex((valid||!allowInvalidPreview)&&isConnectorPlacementValid(mesh)?PANEL_COLOR:COLLISION_COLOR);
  return valid;
}
const thumbnailCanvas=document.createElement('canvas'); const thumbnailRenderer=new THREE.WebGLRenderer({canvas:thumbnailCanvas,alpha:true,antialias:true,preserveDrawingBuffer:true}); thumbnailRenderer.setSize(96,96,false); thumbnailRenderer.setPixelRatio(1);
const thumbnailScene=new THREE.Scene(); const thumbnailCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100); thumbnailCamera.position.set(0,0,10); thumbnailScene.add(new THREE.HemisphereLight(0xffffff,0x182c26,3)); const thumbnailLight=new THREE.DirectionalLight(0xffffff,2); thumbnailLight.position.set(-2,3,5); thumbnailScene.add(thumbnailLight);
const measurementGroup=new THREE.Group(); scene.add(measurementGroup);
const measurements=[];
const measurementLineMaterial=new THREE.LineBasicMaterial({color:0xd7ff4e,transparent:true,opacity:.96,depthTest:false,depthWrite:false});
const measurementHandleGeometry=new THREE.RingGeometry(.035,.052,24);
const measurementHandleMaterial=new THREE.MeshBasicMaterial({color:0xd7ff4e,transparent:true,opacity:.96,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
const measurementCursor=new THREE.Mesh(new THREE.RingGeometry(.045,.062,24),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
measurementCursor.position.z=.74; measurementCursor.renderOrder=8; measurementCursor.visible=false; scene.add(measurementCursor);
let measurementStart=null; let measurementDraft=null; let creatingMeasurement=false; let measurementHandleDrag=null; let hoveredMeasurement=null;
function snapMeasurementPoint(position){ const cos=Math.cos(-GRID_ROTATION); const sin=Math.sin(-GRID_ROTATION); const localX=position.x*cos-position.y*sin; const localY=position.x*sin+position.y*cos; const snappedX=Math.round(localX/MEASUREMENT_GRID_STEP)*MEASUREMENT_GRID_STEP; const snappedY=Math.round(localY/MEASUREMENT_GRID_STEP)*MEASUREMENT_GRID_STEP; const worldCos=Math.cos(GRID_ROTATION); const worldSin=Math.sin(GRID_ROTATION); return new THREE.Vector3(snappedX*worldCos-snappedY*worldSin,snappedX*worldSin+snappedY*worldCos,.72); }
function showMeasurementGuides(point){ const extent=100; measurementGuides.geometry.setFromPoints([new THREE.Vector3(-extent,point.y,.71),new THREE.Vector3(extent,point.y,.71),new THREE.Vector3(point.x,-extent,.71),new THREE.Vector3(point.x,extent,.71)]); measurementGuides.geometry.computeBoundingSphere(); measurementGuides.computeLineDistances(); measurementGuides.visible=true; }
function hideMeasurementGuides(){ measurementGuides.visible=false; }
function measurementComponents(start,end){ const x=end.x-start.x; const y=end.y-start.y; const cos=Math.cos(-GRID_ROTATION); const sin=Math.sin(-GRID_ROTATION); return {x:(x*cos-y*sin)/STL_UNIT_SCALE,y:(x*sin+y*cos)/STL_UNIT_SCALE}; }
function formatMillimetres(value){ const rounded=Math.round(value*10)/10; return Math.abs(rounded-Math.round(rounded))<.01?String(Math.round(rounded)):rounded.toFixed(1); }
function createMeasurementLabel(preview){ const label=document.createElement('div'); label.className=`measurement-label${preview?' preview':''}`; const value=document.createElement('strong'); const details=document.createElement('small'); label.append(value,details); measurementLayer.append(label); return label; }
function updateMeasurementVisual(measurement,end){
  measurement.end.copy(end);
  const direction=new THREE.Vector2(end.x-measurement.start.x,end.y-measurement.start.y);
  const length=direction.length();
  const perpendicular=length>.0001?new THREE.Vector2(-direction.y/length,direction.x/length).multiplyScalar(.06):new THREE.Vector2(0,.06);
  const startLow=new THREE.Vector3(measurement.start.x-perpendicular.x,measurement.start.y-perpendicular.y,.72);
  const startHigh=new THREE.Vector3(measurement.start.x+perpendicular.x,measurement.start.y+perpendicular.y,.72);
  const endLow=new THREE.Vector3(end.x-perpendicular.x,end.y-perpendicular.y,.72);
  const endHigh=new THREE.Vector3(end.x+perpendicular.x,end.y+perpendicular.y,.72);
  measurement.line.geometry.setFromPoints([measurement.start,end,startLow,startHigh,endLow,endHigh]);
  measurement.line.geometry.computeBoundingSphere();
  measurement.startHandle.position.copy(measurement.start);
  measurement.endHandle.position.copy(end);
  measurement.midpoint.copy(measurement.start).add(end).multiplyScalar(.5);
  const components=measurementComponents(measurement.start,end);
  measurement.label.firstElementChild.textContent=`${formatMillimetres(length/STL_UNIT_SCALE)} mm`;
  measurement.label.lastElementChild.textContent=`Δ ${formatMillimetres(Math.abs(components.x))} × ${formatMillimetres(Math.abs(components.y))} mm`;
}
function createMeasurement(start,end,preview=false){
  const lineMaterial=measurementLineMaterial.clone();
  const handleMaterial=measurementHandleMaterial.clone();
  const line=new THREE.LineSegments(new THREE.BufferGeometry(),lineMaterial); line.renderOrder=7; line.frustumCulled=false;
  const startHandle=new THREE.Mesh(measurementHandleGeometry,handleMaterial); startHandle.renderOrder=8;
  const endHandle=new THREE.Mesh(measurementHandleGeometry,handleMaterial); endHandle.renderOrder=8;
  const group=new THREE.Group(); group.add(line,startHandle,endHandle); measurementGroup.add(group);
  const measurement={start:start.clone(),end:end.clone(),midpoint:new THREE.Vector3(),line,startHandle,endHandle,group,label:createMeasurementLabel(preview),handleMaterial};
  updateMeasurementVisual(measurement,end);
  return measurement;
}
function removeMeasurementVisual(measurement){ measurementGroup.remove(measurement.group); measurement.line.geometry.dispose(); measurement.line.material.dispose(); measurement.handleMaterial.dispose(); measurement.label.remove(); if(hoveredMeasurement===measurement)hoveredMeasurement=null; }
function updateMeasurementControls(){ const hasMeasurements=measurements.length>0; clearMeasurements.disabled=!hasMeasurements; measureStatus.classList.toggle('active',state.measureMode); measureStatus.textContent=!state.measureMode?'Measure':creatingMeasurement?'Release to place · Esc to cancel':'Drag between two points · 20 mm snap'; }
function cancelMeasurementDraft(){ if(measurementDraft)removeMeasurementVisual(measurementDraft); measurementDraft=null; measurementStart=null; creatingMeasurement=false; hideMeasurementGuides(); updateMeasurementControls(); }
function setMeasureMode(enabled){ state.measureMode=enabled; measureTool.classList.toggle('active',enabled); measureTool.setAttribute('aria-pressed',String(enabled)); measurementGrid.visible=enabled; measurementCursor.visible=false; hideMeasurementGuides(); canvas.style.cursor=''; dropZone.classList.toggle('measuring',enabled); if(enabled)select(null); else cancelMeasurementDraft(); updateMeasurementControls(); }
function worldToCanvas(point){ const projected=point.clone().project(camera); return new THREE.Vector2((projected.x+1)*.5*canvas.clientWidth,(1-projected.y)*.5*canvas.clientHeight); }
function distanceToScreenSegment(point,start,end){ const segment=end.clone().sub(start); const lengthSquared=segment.lengthSq(); if(!lengthSquared)return point.distanceTo(start); const amount=THREE.MathUtils.clamp(point.clone().sub(start).dot(segment)/lengthSquared,0,1); return point.distanceTo(start.clone().add(segment.multiplyScalar(amount))); }
function findMeasurementHit(event,handlesOnly=false){ const rect=canvas.getBoundingClientRect(); const point=new THREE.Vector2(event.clientX-rect.left,event.clientY-rect.top); for(let index=measurements.length-1;index>=0;index--){ const measurement=measurements[index]; const start=worldToCanvas(measurement.start); const end=worldToCanvas(measurement.end); if(point.distanceTo(start)<=12)return {measurement,handle:'start'}; if(point.distanceTo(end)<=12)return {measurement,handle:'end'}; if(!handlesOnly&&distanceToScreenSegment(point,start,end)<=9)return {measurement,handle:null}; } return null; }
function setHoveredMeasurement(measurement){ if(hoveredMeasurement===measurement)return; if(hoveredMeasurement){hoveredMeasurement.line.material.color.setHex(0xd7ff4e);hoveredMeasurement.handleMaterial.color.setHex(0xd7ff4e);hoveredMeasurement.label.classList.remove('hovered');} hoveredMeasurement=measurement; if(measurement){measurement.line.material.color.setHex(0xffffff);measurement.handleMaterial.color.setHex(0xffffff);measurement.label.classList.add('hovered');} }
function beginMeasurementCreation(event){ const point=snapMeasurementPoint(screenToBoard(event)); measurementStart=point.clone(); measurementDraft=createMeasurement(point,point,true); creatingMeasurement=true; measurementCursor.position.copy(point); measurementCursor.visible=true; showMeasurementGuides(point); canvas.setPointerCapture(event.pointerId); updateMeasurementControls(); }
function updateMeasurementPointer(event){ const point=snapMeasurementPoint(screenToBoard(event)); if(state.measureMode){measurementCursor.position.copy(point);measurementCursor.visible=true;} if(creatingMeasurement&&measurementDraft){updateMeasurementVisual(measurementDraft,point);showMeasurementGuides(point);} if(measurementHandleDrag){ const measurement=measurementHandleDrag.measurement; if(measurementHandleDrag.handle==='start')measurement.start.copy(point); updateMeasurementVisual(measurement,measurementHandleDrag.handle==='end'?point:measurement.end); showMeasurementGuides(point); } }
function finishMeasurementCreation(){ if(!creatingMeasurement||!measurementDraft)return; if(measurementDraft.end.distanceTo(measurementStart)<MEASUREMENT_GRID_STEP*.5){cancelMeasurementDraft();return;} measurementDraft.label.classList.remove('preview'); measurements.push(measurementDraft); measurementDraft=null; measurementStart=null; creatingMeasurement=false; hideMeasurementGuides(); updateMeasurementControls(); recordHistory(); }
function beginMeasurementHandleDrag(event,hit){ const point=hit.handle==='start'?hit.measurement.start:hit.measurement.end; measurementHandleDrag={measurement:hit.measurement,handle:hit.handle,original:point.clone()}; measurementGrid.visible=true; showMeasurementGuides(point); setHoveredMeasurement(hit.measurement); canvas.setPointerCapture(event.pointerId); canvas.style.cursor='grabbing'; }
function finishMeasurementHandleDrag(){ if(!measurementHandleDrag)return; const measurement=measurementHandleDrag.measurement; if(measurement.start.distanceTo(measurement.end)<MEASUREMENT_GRID_STEP*.5){ if(measurementHandleDrag.handle==='start')measurement.start.copy(measurementHandleDrag.original); updateMeasurementVisual(measurement,measurementHandleDrag.handle==='end'?measurementHandleDrag.original:measurement.end); } measurementHandleDrag=null; measurementGrid.visible=state.measureMode; hideMeasurementGuides(); canvas.style.cursor=''; recordHistory(); }
function updateMeasurementLabels(){ const width=dropZone.clientWidth; const height=dropZone.clientHeight; [...measurements,...(measurementDraft?[measurementDraft]:[])].forEach(measurement=>{ const projected=measurement.midpoint.clone().project(camera); measurement.label.style.left=`${(projected.x+1)*.5*width}px`; measurement.label.style.top=`${(1-projected.y)*.5*height}px`; measurement.label.hidden=projected.z<-1||projected.z>1; }); }
measureTool.addEventListener('click',()=>setMeasureMode(!state.measureMode));
clearMeasurements.addEventListener('click',()=>{ measurements.splice(0).forEach(removeMeasurementVisual); cancelMeasurementDraft(); updateMeasurementControls(); recordHistory(); });
document.addEventListener('keydown',event=>{
  const active=document.activeElement;
  if(['INPUT','TEXTAREA','SELECT'].includes(active?.tagName)||active?.isContentEditable||document.querySelector('dialog[open]'))return;
  if(draggedMesh||measurementHandleDrag||creatingMeasurement||menuDrag)return;
  const modifier=event.ctrlKey||event.metaKey;
  const key=event.key.toLowerCase();
  if(modifier&&!event.altKey&&key==='z'){event.preventDefault();if(event.shiftKey)redoBoard();else undoBoard();return;}
  if(modifier&&!event.altKey&&key==='y'){event.preventDefault();redoBoard();return;}
  if(!modifier&&!event.altKey&&key==='delete'){if(deleteSelection())event.preventDefault();return;}
  if(modifier||event.altKey)return;
  if(key==='m'){setMeasureMode(!state.measureMode);return;}
  if(event.key==='Escape'&&state.measureMode){if(measurementDraft)cancelMeasurementDraft();else setMeasureMode(false);}
});
updateMeasurementControls();
function resize(){ const r=dropZone.getBoundingClientRect(); const height=5.8; const width=height*r.width/r.height; renderer.setSize(r.width,r.height,false); camera.left=-width/2; camera.right=width/2; camera.top=height/2; camera.bottom=-height/2; camera.updateProjectionMatrix(); } new ResizeObserver(resize).observe(dropZone); resize();
function animate(){ requestAnimationFrame(animate); controls.update(); updateMeasurementLabels(); updateConnectionWarningArrows(); renderer.render(scene,camera); } animate();
function prepareGeometry(geometry,part) { geometry.scale(STL_UNIT_SCALE,STL_UNIT_SCALE,STL_UNIT_SCALE); geometry.computeBoundingBox(); const center=new THREE.Vector3(); geometry.boundingBox.getCenter(center); const configuredOrigin=MODEL_ORIGINS_MM[part.file]; if(configuredOrigin){ geometry.translate(-configuredOrigin[0]*STL_UNIT_SCALE,-configuredOrigin[1]*STL_UNIT_SCALE,-center.z); geometry.userData.logicalOrigin=new THREE.Vector2(configuredOrigin[0],configuredOrigin[1]); } else { geometry.translate(-center.x,-center.y,-center.z); } geometry.computeBoundingBox(); return geometry; }
async function getGeometry(part) { if(state.models.has(part.file)) return state.models.get(part.file); const geometry=await loader.loadAsync(part.url); const model=prepareGeometry(geometry,part); state.models.set(part.file,model); return model; }
// Quick-build palette: the centre fills a cell, the four wedges add quarters,
// and the four outer vertices add half panels. It never receives pointer events.
const quickBuildGroup=new THREE.Group(); scene.add(quickBuildGroup);
const quickBuildLines=[];
const quickRadius=GRID_VERTEX_RADIUS_MM*STL_UNIT_SCALE;
const quickInnerRadius=quickRadius*.26;
const quickOuter=[[0,quickRadius],[quickRadius,0],[0,-quickRadius],[-quickRadius,0]];
const quickInner=[[0,quickInnerRadius],[quickInnerRadius,0],[0,-quickInnerRadius],[-quickInnerRadius,0]];
function quickLine(a,b){quickBuildLines.push(a[0],a[1],.69,b[0],b[1],.69);}
for(let index=0;index<4;index++){
  quickLine(quickOuter[index],quickOuter[(index+1)%4]);
  quickLine(quickInner[index],quickInner[(index+1)%4]);
  quickLine(quickInner[index],quickOuter[index]);
}
const quickLineGeometry=new THREE.BufferGeometry(); quickLineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(quickBuildLines,3));
const quickOutline=new THREE.LineSegments(quickLineGeometry,new THREE.LineBasicMaterial({color:0xe1e9e5,transparent:true,opacity:.5,depthTest:false,depthWrite:false}));
quickOutline.frustumCulled=false; quickOutline.renderOrder=6; quickBuildGroup.add(quickOutline);
for(const [x,y] of quickOuter){ const marker=new THREE.Mesh(new THREE.RingGeometry(.045,.065,24),new THREE.MeshBasicMaterial({color:0xe1e9e5,transparent:true,opacity:.55,depthTest:false,depthWrite:false,side:THREE.DoubleSide})); marker.position.set(x,y,.7); marker.renderOrder=7; quickBuildGroup.add(marker); }
for(const [x,y] of quickInner){ const marker=new THREE.Mesh(new THREE.CircleGeometry(.035,20),new THREE.MeshBasicMaterial({color:0xe1e9e5,transparent:true,opacity:.55,depthTest:false,depthWrite:false,side:THREE.DoubleSide})); marker.position.set(x,y,.7); marker.renderOrder=7; quickBuildGroup.add(marker); }
quickBuildGroup.visible=false;
let quickBuildCell=null; let quickBuildGhost=null; let quickBuildGhostKey=null; let quickBuildToken=0; let quickPress=null;
function quickBuildOptions(){
  const rounded=window.SKADIS_CORNER_STYLE==='Rounded'?' rounded':'';
  return [
    ['full','main square.stl',0],
    ['corner-ne',`90 horizontal${rounded}.stl`,0],
    ['corner-nw',`90 vertical${rounded}.stl`,Math.PI],
    ['corner-sw',`90 horizontal${rounded}.stl`,Math.PI],
    ['corner-se',`90 vertical${rounded}.stl`,0],
    ['half-n','180 horizontal.stl',0],
    ['half-e','180 vertical.stl',0],
    ['half-s','180 horizontal.stl',Math.PI],
    ['half-w','180 vertical.stl',Math.PI]
  ];
}
function quickChoiceAt(point,center){
  const x=point.x-center.x, y=point.y-center.y;
  if(Math.abs(x)+Math.abs(y)>quickRadius+.015)return null;
  const vertices=[['half-n',0,quickRadius],['half-e',quickRadius,0],['half-s',0,-quickRadius],['half-w',-quickRadius,0]];
  const vertex=vertices.find(([,vx,vy])=>Math.hypot(x-vx,y-vy)<quickRadius*.23||Math.hypot(x-vx*.26,y-vy*.26)<quickRadius*.11);
  if(vertex)return vertex[0];
  if(Math.abs(x)+Math.abs(y)<quickInnerRadius)return 'full';
  return `corner-${y>=0?'n':'s'}${x>=0?'e':'w'}`;
}
function isQuickChoiceValid(choice,center){
  const candidate={userData:{part:choice.part},position:center,rotation:{z:choice.rotation}};
  if(hasPanelCollision(candidate))return false;
  const polygon=transformPanelPolygon(candidate);
  return placed.children.some(panel=>PANEL_POLYGONS_MM[panel.userData.part.file]&&polygonsShareEdge(polygon,transformPanelPolygon(panel)));
}
function removeQuickGhost(){ quickBuildToken++; if(quickBuildGhost){scene.remove(quickBuildGhost);quickBuildGhost.material.dispose();quickBuildGhost=null;} quickBuildGhostKey=null; }
function hideQuickBuild(){quickBuildGroup.visible=false;quickBuildCell=null;removeQuickGhost();canvas.style.cursor='';}
function setQuickGhost(choice,center){
  const key=choice?`${center.x.toFixed(4)}:${center.y.toFixed(4)}:${choice.part.file}:${choice.rotation}`:null;
  if(key===quickBuildGhostKey)return;
  removeQuickGhost();
  if(!choice)return;
  quickBuildGhostKey=key;
  const token=quickBuildToken;
  getGeometry(choice.part).then(geometry=>{
    if(token!==quickBuildToken||!quickBuildCell)return;
    const candidate={userData:{part:choice.part},position:center,rotation:{z:choice.rotation}};
    const material=new THREE.MeshStandardMaterial({color:isConnectorPlacementValid(candidate)?0xc7ceca:COLLISION_COLOR,roughness:.85,transparent:true,opacity:.3,depthTest:false,depthWrite:false});
    const ghost=new THREE.Mesh(geometry,material);
    ghost.position.set(center.x,center.y,.56);
    ghost.rotation.z=choice.rotation;
    ghost.renderOrder=5;
    scene.add(ghost);
    quickBuildGhost=ghost;
  }).catch(()=>{});
}
function updateQuickBuild(event){
  if(state.measureMode||menuDrag||placed.children.every(mesh=>!PANEL_POLYGONS_MM[mesh.userData.part.file])){hideQuickBuild();return null;}
  const point=screenToBoard(event);
  const cursor=new THREE.Vector2(point.x,point.y);
  if(placed.children.some(mesh=>{const polygon=transformPanelPolygon(mesh);return polygon&&pointInsidePolygon(cursor,polygon);})){hideQuickBuild();return null;}
  const center=quickBuildCell&&Math.abs(point.x-quickBuildCell.center.x)+Math.abs(point.y-quickBuildCell.center.y)<=quickRadius+.015
    ?quickBuildCell.center
    :snapToGridCellCenter({category:'Structure'},point);
  const options=new Map();
  for(const [id,file,rotation] of quickBuildOptions()){
    const part=parts.find(item=>item.file===file);
    if(!part)continue;
    const choice={id,part:{...part,initialRotation:rotation},rotation};
    if(isQuickChoiceValid(choice,center))options.set(id,choice);
  }
  if(!options.size){hideQuickBuild();return null;}
  quickBuildCell={center,options};
  quickBuildGroup.position.set(center.x,center.y,0);
  quickBuildGroup.visible=true;
  const id=quickChoiceAt(point,center);
  const choice=options.get(id)||null;
  setQuickGhost(choice,center);
  canvas.style.cursor=choice?'pointer':'';
  return choice;
}
const autoConnectors=new THREE.Group(); scene.add(autoConnectors); const autoConnectorMaterial=new THREE.MeshStandardMaterial({color:0xc8ef45,roughness:.42,metalness:.12,transparent:true,opacity:.5,depthWrite:false}); let connectorRevision=0;
function getWorldConnectionPorts(mesh){ const edges=CONNECTION_PORTS[mesh.userData.part.file]||[]; const cos=Math.cos(mesh.rotation.z); const sin=Math.sin(mesh.rotation.z); const ports=[]; edges.forEach(edge=>{ const normalLength=Math.hypot(edge.normal[0],edge.normal[1]); const localNormalX=edge.normal[0]/normalLength; const localNormalY=edge.normal[1]/normalLength; const normal=new THREE.Vector2(localNormalX*cos-localNormalY*sin,localNormalX*sin+localNormalY*cos); edge.points.forEach(([xMm,yMm],index)=>{ const x=xMm*STL_UNIT_SCALE; const y=yMm*STL_UNIT_SCALE; ports.push({ key:`${mesh.uuid}:${edge.id}:${index}`, mesh, edge:edge.id, index, position:new THREE.Vector3(mesh.position.x+x*cos-y*sin,mesh.position.y+x*sin+y*cos,mesh.position.z), normal }); }); }); return ports; }
function panelsHaveMatchingConnector(first,second){
  const reach=2*GRID_VERTEX_RADIUS_MM*STL_UNIT_SCALE+4*STL_UNIT_SCALE;
  if(Math.abs(first.position.x-second.position.x)>reach||Math.abs(first.position.y-second.position.y)>reach)return false;
  const firstPorts=getWorldConnectionPorts(first);
  const secondPorts=getWorldConnectionPorts(second);
  return firstPorts.some(port=>secondPorts.some(otherPort=>
    port.normal.dot(otherPort.normal)<-.98&&port.position.distanceTo(otherPort.position)<=4*STL_UNIT_SCALE
  ));
}
function isConnectorPlacementValid(mesh){
  if(!state.avoidImpossibleConnections||!PANEL_POLYGONS_MM[mesh.userData.part.file])return true;
  const panels=placed.children.filter(other=>other!==mesh&&PANEL_POLYGONS_MM[other.userData.part.file]);
  if(!panels.length)return true;
  return panels.some(other=>panelsHaveMatchingConnector(mesh,other));
}
function disconnectedCornerPoint(corner,other){
  const polygon=transformPanelPolygon(corner);
  const neighbor=transformPanelPolygon(other);
  const origin=new THREE.Vector2(corner.position.x,corner.position.y);
  let closest=null;
  let closestDistance=Infinity;
  for(let i=0;i<polygon.length;i++){
    const start=polygon[i];
    const end=polygon[(i+1)%polygon.length];
    const edge=end.clone().sub(start);
    const length=edge.length();
    if(length<.001)continue;
    const direction=edge.divideScalar(length);
    for(let j=0;j<neighbor.length;j++){
      const first=neighbor[j];
      const last=neighbor[(j+1)%neighbor.length];
      if(Math.abs(direction.cross(last.clone().sub(first).normalize()))>.01)continue;
      if(Math.abs(first.clone().sub(start).cross(direction))>.045||Math.abs(last.clone().sub(start).cross(direction))>.045)continue;
      const firstAlong=first.clone().sub(start).dot(direction);
      const lastAlong=last.clone().sub(start).dot(direction);
      const overlapStart=Math.max(0,Math.min(firstAlong,lastAlong));
      const overlapEnd=Math.min(length,Math.max(firstAlong,lastAlong));
      if(overlapEnd-overlapStart<=.08)continue;
      const amount=THREE.MathUtils.clamp(origin.clone().sub(start).dot(direction),overlapStart,overlapEnd);
      const point=start.clone().addScaledVector(direction,amount);
      const distance=point.distanceToSquared(origin);
      if(distance<closestDistance){closest=point;closestDistance=distance;}
    }
  }
  return closest;
}
function updateConnectionWarningArrows(){
  for(const {element,point} of connectionWarningArrows.values()){
    const projected=new THREE.Vector3(point.x,point.y,.8).project(camera);
    element.hidden=projected.z<-1||projected.z>1||Math.abs(projected.x)>1.05||Math.abs(projected.y)>1.05;
    if(element.hidden)continue;
    element.style.left=`${(projected.x+1)*.5*canvas.clientWidth}px`;
    element.style.top=`${(1-projected.y)*.5*canvas.clientHeight}px`;
  }
}
function refreshConnectionWarnings(){
  for(const mesh of placed.children){
    if(PANEL_POLYGONS_MM[mesh.userData.part.file])mesh.material.color.setHex(isConnectorPlacementValid(mesh)?PANEL_COLOR:COLLISION_COLOR);
  }
  const active=new Set();
  if(state.avoidImpossibleConnections){
    const panels=placed.children.filter(mesh=>PANEL_POLYGONS_MM[mesh.userData.part.file]);
    for(const corner of panels.filter(mesh=>mesh.userData.part.file.startsWith('90 '))){
      for(const other of panels){
        if(corner===other||panelsHaveMatchingConnector(corner,other))continue;
        const point=disconnectedCornerPoint(corner,other);
        if(!point)continue;
        const key=`${corner.uuid}:${other.uuid}`;
        active.add(key);
        let arrow=connectionWarningArrows.get(key);
        if(!arrow){
          const element=document.createElement('span');
          element.className='connection-warning-arrow';
          element.innerHTML='<span>No connection</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 20 20m-8 0h8v-8"/></svg>';
          connectionWarningLayer.append(element);
          arrow={element,point};
          connectionWarningArrows.set(key,arrow);
        }
        arrow.point=point;
      }
    }
  }
  for(const [key,arrow] of connectionWarningArrows){
    if(!active.has(key)){arrow.element.remove();connectionWarningArrows.delete(key);}
  }
}
async function recomputeAutoConnectors(){
  const revision=++connectorRevision;
  autoConnectors.clear();
  updateBillOfMaterials();
  const connectorPart=parts.find(part=>part.file==='connector.stl');
  if(!connectorPart)return;
  const connectorGeometry=await getGeometry(connectorPart);
  if(revision!==connectorRevision)return;
  const panels=placed.children.filter(mesh=>CONNECTION_PORTS[mesh.userData.part.file]);
  const ports=panels.flatMap(getWorldConnectionPorts);
  const used=new Set();
  const tolerance=4*STL_UNIT_SCALE;
  for(let firstIndex=0;firstIndex<ports.length;firstIndex++){
    const first=ports[firstIndex];
    if(used.has(first.key))continue;
    let match=null;
    let matchDistance=Infinity;
    for(let secondIndex=firstIndex+1;secondIndex<ports.length;secondIndex++){
      const second=ports[secondIndex];
      if(first.mesh===second.mesh||used.has(second.key)||first.normal.dot(second.normal)>-.98)continue;
      const distance=first.position.distanceTo(second.position);
      if(distance<=tolerance&&distance<matchDistance){match=second;matchDistance=distance;}
    }
    if(!match)continue;
    used.add(first.key);
    used.add(match.key);
    const connector=new THREE.Mesh(connectorGeometry,autoConnectorMaterial);
    connector.position.copy(first.position).add(match.position).multiplyScalar(.5);
    connector.position.z=.586;
    connector.rotation.z=0;
    connector.renderOrder=2;
    connector.userData.part=connectorPart;
    connector.userData.generatedConnector=true;
    connector.userData.panels=[first.mesh.uuid,match.mesh.uuid];
    connector.userData.ports=[first.key,match.key];
    autoConnectors.add(connector);
  }
  updateBillOfMaterials();
}
const autoRings=new THREE.Group(); scene.add(autoRings); const autoRingMaterial=new THREE.MeshStandardMaterial({color:0xc8ef45,roughness:.42,metalness:.12,transparent:true,opacity:.65,depthWrite:false}); let ringRevision=0;
function transformPanelPolygon(mesh){ const polygon=PANEL_POLYGONS_MM[mesh.userData.part.file]; if(!polygon)return null; const cos=Math.cos(mesh.rotation.z); const sin=Math.sin(mesh.rotation.z); return polygon.map(([xMm,yMm])=>{ const x=xMm*STL_UNIT_SCALE; const y=yMm*STL_UNIT_SCALE; return new THREE.Vector2(mesh.position.x+x*cos-y*sin,mesh.position.y+x*sin+y*cos); }); }
function projectPolygon(polygon,axis){ let minimum=Infinity; let maximum=-Infinity; polygon.forEach(point=>{ const projection=point.dot(axis); minimum=Math.min(minimum,projection); maximum=Math.max(maximum,projection); }); return {minimum,maximum}; }
function polygonsOverlap(first,second){
  for(const polygon of [first,second]){
    for(let index=0;index<polygon.length;index++){
      const current=polygon[index];
      const next=polygon[(index+1)%polygon.length];
      const axis=new THREE.Vector2(-(next.y-current.y),next.x-current.x).normalize();
      const firstProjection=projectPolygon(first,axis);
      const secondProjection=projectPolygon(second,axis);
      const overlap=Math.min(firstProjection.maximum,secondProjection.maximum)-Math.max(firstProjection.minimum,secondProjection.minimum);
      if(overlap<=COLLISION_EPSILON)return false;
    }
  }
  return true;
}
function hasPanelCollision(mesh){ const polygon=transformPanelPolygon(mesh); if(!polygon)return false; return placed.children.some(other=>other!==mesh&&Boolean(PANEL_POLYGONS_MM[other.userData.part.file])&&polygonsOverlap(polygon,transformPanelPolygon(other))); }
function polygonsShareEdge(first,second){
  for(let i=0;i<first.length;i++){
    const a=first[i], b=first[(i+1)%first.length];
    const edge=b.clone().sub(a);
    const length=edge.length();
    if(length<.001)continue;
    const direction=edge.divideScalar(length);
    for(let j=0;j<second.length;j++){
      const c=second[j], d=second[(j+1)%second.length];
      const other=d.clone().sub(c).normalize();
      if(Math.abs(direction.cross(other))>.01)continue;
      if(Math.abs(c.clone().sub(a).cross(direction))>.045||Math.abs(d.clone().sub(a).cross(direction))>.045)continue;
      const cAlong=c.clone().sub(a).dot(direction);
      const dAlong=d.clone().sub(a).dot(direction);
      if(Math.min(length,Math.max(cAlong,dAlong))-Math.max(0,Math.min(cAlong,dAlong))>.08)return true;
    }
  }
  return false;
}
function pointInsidePolygon(point,polygon){ let inside=false; for(let index=0,previous=polygon.length-1;index<polygon.length;previous=index++){ const currentPoint=polygon[index]; const previousPoint=polygon[previous]; const crosses=(currentPoint.y>point.y)!==(previousPoint.y>point.y); if(crosses&&point.x<(previousPoint.x-currentPoint.x)*(point.y-currentPoint.y)/(previousPoint.y-currentPoint.y)+currentPoint.x)inside=!inside; } return inside; }
function getVertexSectorMask(vertex,polygon){ let mask=0; const sampleDistance=15*STL_UNIT_SCALE; for(let sector=0;sector<8;sector++){ const angle=(sector+.5)*Math.PI/4; const sample=new THREE.Vector2(vertex.x+Math.cos(angle)*sampleDistance,vertex.y+Math.sin(angle)*sampleDistance); if(pointInsidePolygon(sample,polygon))mask|=1<<sector; } return mask; }
function countBits(mask){ let count=0; for(let value=mask;value;value>>=1)count+=value&1; return count; }
function getContiguousSectorStart(mask){ if(mask===255)return 0; const starts=[]; for(let sector=0;sector<8;sector++){ const occupied=mask&(1<<sector); const previous=mask&(1<<((sector+7)%8)); if(occupied&&!previous)starts.push(sector); } return starts.length===1?starts[0]:null; }
async function recomputeAutoRings(){
  const revision=++ringRevision;
  autoRings.clear();
  updateBillOfMaterials();
  const nodes=[];
  const tolerance=4*STL_UNIT_SCALE;
  placed.children.forEach(mesh=>{
    const polygon=transformPanelPolygon(mesh);
    if(!polygon)return;
    polygon.forEach((vertex,index)=>{
      let node=nodes.find(candidate=>candidate.position.distanceTo(vertex)<=tolerance);
      if(!node){node={position:vertex.clone(),positions:[],panels:new Set(),mask:0,blocked:false};nodes.push(node);}
      const localVertex=PANEL_POLYGONS_MM[mesh.userData.part.file][index];
      // The right-angle vertex of a 90° panel has no physical ring mount.
      if(mesh.userData.part.file.startsWith('90 ')&&Math.abs(localVertex[0])<.001&&Math.abs(localVertex[1])<.001){node.blocked=true;return;}
      const mask=getVertexSectorMask(vertex,polygon);
      node.positions.push(vertex.clone());
      node.panels.add(mesh.uuid);
      node.mask|=mask;
    });
  });
  for(const node of nodes){
    if(node.blocked)continue;
    if(state.skipUnnecessaryHardware&&node.panels.size<=1)continue;
    const sectorCount=countBits(node.mask);
    if(!sectorCount)continue;
    const startSector=getContiguousSectorStart(node.mask);
    if(startSector===null)continue;
    const ringPart=parts.find(part=>part.file===`ring ${sectorCount}-8.stl`);
    if(!ringPart)continue;
    const geometry=await getGeometry(ringPart);
    if(revision!==ringRevision)return;
    const ring=new THREE.Mesh(geometry,autoRingMaterial);
    ring.position.set(node.positions.reduce((sum,position)=>sum+position.x,0)/node.positions.length,node.positions.reduce((sum,position)=>sum+position.y,0)/node.positions.length,.588);
    ring.rotation.z=startSector*Math.PI/4;
    ring.renderOrder=3;
    ring.userData.part=ringPart;
    ring.userData.generatedRing=true;
    ring.userData.sectorMask=node.mask;
    autoRings.add(ring);
  }
  updateBillOfMaterials();
}
const PANEL_MERGE_TARGETS=[
  {file:'main square.stl',rotation:0,mask:15},
  {file:'180 horizontal.stl',rotation:0,mask:3},
  {file:'180 vertical.stl',rotation:Math.PI,mask:6},
  {file:'180 horizontal.stl',rotation:Math.PI,mask:12},
  {file:'180 vertical.stl',rotation:0,mask:9}
];
function panelQuarterMask(mesh){
  const polygon=transformPanelPolygon(mesh);
  if(!polygon)return 0;
  const offset=GRID_VERTEX_RADIUS_MM*STL_UNIT_SCALE*.25;
  const samples=[[1,1],[-1,1],[-1,-1],[1,-1]];
  return samples.reduce((mask,[x,y],index)=>{
    const point=new THREE.Vector2(mesh.position.x+x*offset,mesh.position.y+y*offset);
    return mask|(pointInsidePolygon(point,polygon)?1<<index:0);
  },0);
}
function findPanelMerge(){
  if(!state.avoidImpossibleConnections)return null;
  const cells=new Map();
  for(const mesh of placed.children){
    if(!PANEL_POLYGONS_MM[mesh.userData.part.file])continue;
    const key=`${mesh.position.x.toFixed(4)}:${mesh.position.y.toFixed(4)}`;
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push({mesh,mask:panelQuarterMask(mesh)});
  }
  for(const items of cells.values()){
    for(const target of PANEL_MERGE_TARGETS){
      const touching=items.filter(item=>item.mask&target.mask);
      if(touching.length<2||touching.some(item=>item.mesh.userData.part.file.includes('rounded')||(item.mask&~target.mask)))continue;
      const occupied=touching.reduce((mask,item)=>mask|item.mask,0);
      const area=touching.reduce((total,item)=>total+countBits(item.mask),0);
      if(occupied===target.mask&&area===countBits(target.mask))return {target,sources:touching.map(item=>item.mesh)};
    }
  }
  return null;
}
async function mergeCompatiblePanels(){
  let candidate;
  while((candidate=findPanelMerge())){
    const part=parts.find(item=>item.file===candidate.target.file);
    if(!part)return;
    let geometry;
    try{geometry=await getGeometry(part);}catch{return;}
    const current=findPanelMerge();
    if(!current||current.target!==candidate.target||current.sources.length!==candidate.sources.length||!current.sources.every(mesh=>candidate.sources.includes(mesh)))continue;
    const selected=current.sources.some(mesh=>state.selection.has(mesh));
    const position=current.sources[0].position.clone();
    for(const mesh of current.sources){state.selection.delete(mesh);placed.remove(mesh);mesh.material.dispose();}
    const replacement=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:PANEL_COLOR,roughness:.5,metalness:.08}));
    replacement.userData.part=part;
    replacement.position.copy(position);
    replacement.rotation.z=current.target.rotation;
    replacement.castShadow=true;
    placed.add(replacement);
    if(selected)select(replacement,true);
  }
}
function recomputeAutoHardware(){ refreshConnectionWarnings(); updateBillOfMaterials(); recomputeAutoConnectors(); recomputeAutoRings(); }
function renderThumbnail(part, geometry) {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  geometry.boundingBox.getSize(size);
  geometry.boundingBox.getCenter(center);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color:0xc8ef45,roughness:.55,metalness:.08}));
  if(part.category==='Ring')mesh.position.set(0,0,0);
  else mesh.position.copy(center).negate();
  thumbnailScene.add(mesh);
  const extent = part.category==='Ring'?RING_THUMBNAIL_EXTENT:Math.max(size.x,size.y,.01)*.54;
  thumbnailCamera.left = -extent;
  thumbnailCamera.right = extent;
  thumbnailCamera.top = extent;
  thumbnailCamera.bottom = -extent;
  thumbnailCamera.updateProjectionMatrix();
  thumbnailRenderer.render(thumbnailScene,thumbnailCamera);
  part.previewUrl = thumbnailCanvas.toDataURL('image/png');
  document.querySelectorAll(`.part-card[data-file="${CSS.escape(part.file)}"] .part-preview`).forEach(preview => {
    const image = new Image();
    image.alt = `${part.name} 3D preview`;
    image.draggable = false;
    image.src = part.previewUrl;
    preview.replaceChildren(image);
  });
  thumbnailScene.remove(mesh);
  mesh.material.dispose();
  updateBillOfMaterials();
}
async function addPart(part, location) { try { const geometry=await getGeometry(part); const material=new THREE.MeshStandardMaterial({color:PANEL_COLOR,roughness:.5,metalness:.08}); const mesh=new THREE.Mesh(geometry,material); mesh.userData.part=part; mesh.rotation.z=part.initialRotation||0; const initialPosition=location||new THREE.Vector3(controls.target.x,controls.target.y,.55); if(!placeMeshOnGrid(mesh,initialPosition)){material.dispose();return;} mesh.castShadow=true; placed.add(mesh); select(mesh); await mergeCompatiblePanels(); updateCount(); recomputeAutoHardware(); recordHistory(); } catch { console.warn(`Could not load ${part.file}`); } }
parts.forEach(part => getGeometry(part).then(geometry => renderThumbnail(part, geometry)).catch(() => console.warn(`Could not load preview for ${part.file}`)));
function addBomPart(counts,part){ if(!part)return; counts.set(part.file,(counts.get(part.file)||0)+1); }
function renderBomList(container,counts,emptyMessage){
  const rows=parts.filter(part=>counts.has(part.file)).map(part=>{
    const row=document.createElement('div');
    row.className='bom-item';
    const preview=document.createElement('span');
    preview.className='bom-item-preview';
    if(part.previewUrl){
      const image=new Image();
      image.src=part.previewUrl;
      image.alt='';
      preview.append(image);
    }
    const name=document.createElement('span');
    name.className='bom-item-name';
    name.textContent=part.name;
    name.title=part.name;
    const quantity=document.createElement('strong');
    quantity.className='bom-item-quantity';
    quantity.textContent=counts.get(part.file);
    row.append(preview,name,quantity);
    return row;
  });
  if(rows.length){container.replaceChildren(...rows);return;}
  const empty=document.createElement('p');
  empty.className='bom-empty';
  empty.textContent=emptyMessage;
  container.replaceChildren(empty);
}
function updateBillOfMaterials(){
  const panelCounts=new Map();
  const connectionCounts=new Map();
  placed.children.forEach(mesh=>{
    const part=mesh.userData.part;
    if(!part)return;
    addBomPart(['Structure','Angle'].includes(part.category)?panelCounts:connectionCounts,part);
  });
  autoConnectors.children.forEach(mesh=>addBomPart(connectionCounts,mesh.userData.part));
  autoRings.children.forEach(mesh=>addBomPart(connectionCounts,mesh.userData.part));
  const panelTotal=[...panelCounts.values()].reduce((sum,value)=>sum+value,0);
  const connectionTotal=[...connectionCounts.values()].reduce((sum,value)=>sum+value,0);
  renderBomList(bomPanelsList,panelCounts,'No panels added.');
  renderBomList(bomConnectionsList,connectionCounts,'No connections required.');
  bomPanelCount.textContent=panelTotal;
  bomConnectionCount.textContent=connectionTotal;
  bomTotalCount.textContent=panelTotal+connectionTotal;
}
function updateCount(){ const n=placed.children.length; count.textContent=`${n} ${n===1?'part':'parts'} on board`; updateBillOfMaterials(); }
const boardHistory=[];
let historyIndex=-1;
const undoBoardButton=document.querySelector('#undo-board');
const redoBoardButton=document.querySelector('#redo-board');
function updateHistoryButtons(){undoBoardButton.disabled=historyIndex<=0;redoBoardButton.disabled=historyIndex>=boardHistory.length-1;}
function captureBoard(){
  return JSON.stringify({
    parts:placed.children.map(mesh=>({file:mesh.userData.part.file,position:mesh.position.toArray(),rotation:mesh.rotation.z})),
    measurements:measurements.map(measurement=>({start:measurement.start.toArray(),end:measurement.end.toArray()})),
    skipUnnecessaryHardware:state.skipUnnecessaryHardware,
    avoidImpossibleConnections:state.avoidImpossibleConnections
  });
}
function recordHistory(){
  const snapshot=captureBoard();
  if(boardHistory[historyIndex]===snapshot)return;
  boardHistory.splice(historyIndex+1);
  boardHistory.push(snapshot);
  if(boardHistory.length>100)boardHistory.shift();
  historyIndex=boardHistory.length-1;
  updateHistoryButtons();
}
function restoreBoard(snapshot){
  const board=JSON.parse(snapshot);
  hideQuickBuild();
  select(null);
  for(const mesh of [...placed.children]){placed.remove(mesh);mesh.material.dispose();}
  for(const item of board.parts){
    const part=parts.find(candidate=>candidate.file===item.file);
    const geometry=state.models.get(item.file);
    if(!part||!geometry)continue;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:PANEL_COLOR,roughness:.5,metalness:.08}));
    mesh.userData.part=part;
    mesh.position.fromArray(item.position);
    mesh.rotation.z=item.rotation;
    mesh.castShadow=true;
    placed.add(mesh);
  }
  measurements.splice(0).forEach(removeMeasurementVisual);
  cancelMeasurementDraft();
  for(const item of board.measurements)measurements.push(createMeasurement(new THREE.Vector3().fromArray(item.start),new THREE.Vector3().fromArray(item.end)));
  state.skipUnnecessaryHardware=board.skipUnnecessaryHardware;
  skipUnnecessaryHardware.checked=board.skipUnnecessaryHardware;
  state.avoidImpossibleConnections=board.avoidImpossibleConnections;
  avoidImpossibleConnections.checked=board.avoidImpossibleConnections;
  updateMeasurementControls();
  updateCount();
  recomputeAutoHardware();
}
function undoBoard(){if(historyIndex<=0)return;restoreBoard(boardHistory[--historyIndex]);updateHistoryButtons();}
function redoBoard(){if(historyIndex>=boardHistory.length-1)return;restoreBoard(boardHistory[++historyIndex]);updateHistoryButtons();}
undoBoardButton.addEventListener('click',undoBoard);
redoBoardButton.addEventListener('click',redoBoard);
skipUnnecessaryHardware.addEventListener('change',event=>{ state.skipUnnecessaryHardware=event.target.checked; recomputeAutoHardware(); recordHistory(); });
avoidImpossibleConnections.addEventListener('change',async event=>{ state.avoidImpossibleConnections=event.target.checked; hideQuickBuild(); await mergeCompatiblePanels(); updateCount(); recomputeAutoHardware(); recordHistory(); });
function select(mesh,additive=false){
  if(!additive){for(const selected of state.selection)selected.material.emissive.setHex(0);state.selection.clear();}
  if(!mesh)return;
  if(additive&&state.selection.has(mesh)){mesh.material.emissive.setHex(0);state.selection.delete(mesh);return;}
  state.selection.add(mesh);
  mesh.material.emissive.setHex(0x883d22);
}
function deleteSelection(){
  if(!state.selection.size)return false;
  for(const mesh of state.selection){placed.remove(mesh);mesh.material.dispose();}
  state.selection.clear();
  updateCount();
  recomputeAutoHardware();
  recordHistory();
  return true;
}
recordHistory();
const PROJECT_FORMAT='superskadis-project';
const PROJECT_VERSION=1;
const projectFileInput=document.querySelector('#project-file');
const openProjectButton=document.querySelector('#open-project');
function isFiniteVector(value,length){return Array.isArray(value)&&value.length===length&&value.every(number=>typeof number==='number'&&Number.isFinite(number)&&Math.abs(number)<10000);}
function readProjectDocument(documentData){
  if(!documentData||documentData.format!==PROJECT_FORMAT||documentData.version!==PROJECT_VERSION)throw new Error('Unsupported project format or version.');
  const board=documentData.board;
  if(!board||!Array.isArray(board.parts)||!Array.isArray(board.measurements)||board.parts.length>5000||board.measurements.length>5000||typeof board.skipUnnecessaryHardware!=='boolean'||typeof board.avoidImpossibleConnections!=='boolean')throw new Error('The project data is incomplete or invalid.');
  const normalized={parts:[],measurements:[],skipUnnecessaryHardware:board.skipUnnecessaryHardware,avoidImpossibleConnections:board.avoidImpossibleConnections};
  for(const item of board.parts){
    if(!item||typeof item.file!=='string'||!parts.some(part=>part.file===item.file)||!isFiniteVector(item.position,3)||typeof item.rotation!=='number'||!Number.isFinite(item.rotation))throw new Error('The project contains an unknown or invalid part.');
    normalized.parts.push({file:item.file,position:item.position,rotation:item.rotation});
  }
  for(const item of board.measurements){
    if(!item||!isFiniteVector(item.start,3)||!isFiniteVector(item.end,3))throw new Error('The project contains an invalid measurement.');
    normalized.measurements.push({start:item.start,end:item.end});
  }
  const view=documentData.camera;
  if(view&&(!isFiniteVector(view.position,3)||!isFiniteVector(view.target,3)||typeof view.zoom!=='number'||!Number.isFinite(view.zoom)||view.zoom<controls.minZoom||view.zoom>controls.maxZoom||view.position[2]<=0))throw new Error('The project contains an invalid camera view.');
  return {board:normalized,camera:view||null};
}
document.querySelector('#save-project').addEventListener('click',()=>{
  const project={format:PROJECT_FORMAT,version:PROJECT_VERSION,savedAt:new Date().toISOString(),board:JSON.parse(captureBoard()),camera:{position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom}};
  const stamp=project.savedAt.slice(0,16).replace('T','-').replace(':','-');
  triggerDownload(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),`superskadis-project-${stamp}.json`);
});
openProjectButton.addEventListener('click',()=>projectFileInput.click());
projectFileInput.addEventListener('change',async()=>{
  const file=projectFileInput.files?.[0];
  if(!file)return;
  openProjectButton.disabled=true;
  try{
    if(file.size>5_000_000)throw new Error('Project file is too large.');
    const project=readProjectDocument(JSON.parse(await file.text()));
    const requiredParts=[...new Set(project.board.parts.map(item=>item.file))];
    await Promise.all(requiredParts.map(file=>getGeometry(parts.find(part=>part.file===file))));
    if((placed.children.length||measurements.length)&&!window.confirm('Open this project and replace the current board?'))return;
    restoreBoard(JSON.stringify(project.board));
    if(project.camera){
      camera.position.fromArray(project.camera.position);
      controls.target.fromArray(project.camera.target);
      camera.zoom=project.camera.zoom;
      camera.updateProjectionMatrix();
      controls.update();
    }
    recordHistory();
  }catch(error){window.alert(`Could not open project: ${error.message||'Invalid JSON file.'}`);}
  finally{projectFileInput.value='';openProjectButton.disabled=false;}
});
function screenToBoard(event){ const rect=canvas.getBoundingClientRect(); pointer.x=((event.clientX-rect.left)/rect.width)*2-1; pointer.y=-((event.clientY-rect.top)/rect.height)*2+1; raycaster.setFromCamera(pointer,camera); const target=new THREE.Plane(new THREE.Vector3(0,0,1),0); const result=new THREE.Vector3(); raycaster.ray.intersectPlane(target,result); result.z=.55; return result; }
canvas.addEventListener('wheel',event=>{ event.preventDefault(); const pointBeforeZoom=screenToBoard(event); const deltaMultiplier=event.deltaMode===1?16:event.deltaMode===2?100:1; const zoomFactor=Math.exp(-event.deltaY*deltaMultiplier*.0015*controls.zoomSpeed); const nextZoom=THREE.MathUtils.clamp(camera.zoom*zoomFactor,controls.minZoom,controls.maxZoom); if(nextZoom===camera.zoom)return; camera.zoom=nextZoom; camera.updateProjectionMatrix(); const pointAfterZoom=screenToBoard(event); const correction=pointBeforeZoom.sub(pointAfterZoom); camera.position.x+=correction.x; camera.position.y+=correction.y; controls.target.x+=correction.x; controls.target.y+=correction.y; controls.update(); },{passive:false});
document.addEventListener('skadis:add-part', event => addPart(event.detail));
let menuDrag=null; let menuDragToken=0;
async function finishMenuDrop(){ if(!menuDrag?.mesh)return; const mesh=menuDrag.mesh; if(mesh.userData.placementValid===false){scene.remove(mesh);mesh.material.dispose();menuDrag=null;return;} scene.remove(mesh); placed.add(mesh); mesh.visible=true; select(mesh); menuDrag=null; await mergeCompatiblePanels(); updateCount(); recomputeAutoHardware(); recordHistory(); }
document.addEventListener('skadis:menu-drag-start',async event=>{ hideQuickBuild(); const token=++menuDragToken; if(menuDrag?.mesh){scene.remove(menuDrag.mesh);menuDrag.mesh.material.dispose();} menuDrag={token,part:event.detail.part,mesh:null,valid:false,desiredPosition:null,over:false,dropped:false}; try{ const geometry=await getGeometry(event.detail.part); if(!menuDrag||menuDrag.token!==token)return; const material=new THREE.MeshStandardMaterial({color:PANEL_COLOR,roughness:.5,metalness:.08}); const mesh=new THREE.Mesh(geometry,material); mesh.userData.part=event.detail.part; mesh.rotation.z=event.detail.part.initialRotation||0; mesh.castShadow=true; mesh.visible=menuDrag.over; if(menuDrag.desiredPosition)menuDrag.valid=placeMeshOnGrid(mesh,menuDrag.desiredPosition,true); menuDrag.mesh=mesh; scene.add(mesh); if(menuDrag.dropped)finishMenuDrop(); }catch{ if(menuDrag?.token===token)menuDrag=null; } });
document.addEventListener('skadis:menu-drag-move',event=>{ if(!menuDrag)return; menuDrag.over=true; menuDrag.desiredPosition=screenToBoard(event.detail); if(menuDrag.mesh){menuDrag.mesh.visible=true;menuDrag.valid=placeMeshOnGrid(menuDrag.mesh,menuDrag.desiredPosition,true);} });
document.addEventListener('skadis:menu-drag-leave',()=>{ if(menuDrag){menuDrag.over=false;if(menuDrag.mesh)menuDrag.mesh.visible=false;} });
document.addEventListener('skadis:menu-drag-drop',event=>{ const desiredPosition=screenToBoard(event.detail); if(!menuDrag){addPart(event.detail.part,desiredPosition);return;} menuDrag.over=true;menuDrag.dropped=true;menuDrag.desiredPosition=desiredPosition;if(menuDrag.mesh){menuDrag.valid=placeMeshOnGrid(menuDrag.mesh,desiredPosition,true);finishMenuDrop();} });
document.addEventListener('skadis:menu-drag-end',()=>{ if(!menuDrag||menuDrag.dropped)return;if(menuDrag.mesh){scene.remove(menuDrag.mesh);menuDrag.mesh.material.dispose();}menuDrag=null; });
let draggedMesh=null; let dragStart=null; let cameraPan=null;
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const handleHit=findMeasurementHit(e,true);
  if(handleHit){hideQuickBuild();beginMeasurementHandleDrag(e,handleHit);return;}
  if(state.measureMode){hideQuickBuild();beginMeasurementCreation(e);return;}
  const rect=canvas.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(placed.children)[0];
  const multiSelect=e.shiftKey||e.ctrlKey;
  select(hit?.object,multiSelect);
  if(multiSelect){hideQuickBuild();return;}
  canvas.setPointerCapture(e.pointerId);
  if(hit){hideQuickBuild();draggedMesh=hit.object;dragStart={position:draggedMesh.position.clone(),rotation:draggedMesh.rotation.z};return;}
  const choice=updateQuickBuild(e);
  quickPress=choice?{id:choice.id,file:choice.part.file,rotation:choice.rotation,center:quickBuildCell.center.clone()}:null;
  hideQuickBuild();
  cameraPan={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};
});
canvas.addEventListener('pointermove',e=>{
  if((e.shiftKey||e.ctrlKey)&&!draggedMesh&&!cameraPan&&!measurementHandleDrag&&!creatingMeasurement){hideQuickBuild();return;}
  if(measurementHandleDrag||creatingMeasurement){updateMeasurementPointer(e);return;}
  const measurementHit=findMeasurementHit(e);
  setHoveredMeasurement(measurementHit?.measurement||null);
  if(state.measureMode){hideQuickBuild();updateMeasurementPointer(e);return;}
  if(draggedMesh){hideQuickBuild();placeMeshOnGrid(draggedMesh,screenToBoard(e));refreshConnectionWarnings();return;}
  if(cameraPan){
    if(Math.hypot(e.clientX-cameraPan.startX,e.clientY-cameraPan.startY)>5)cameraPan.moved=true;
    if(!cameraPan.moved)return;
    hideQuickBuild();
    const rect=canvas.getBoundingClientRect();
    const unitPerPixel=(camera.top-camera.bottom)/(camera.zoom*rect.height);
    const moveX=(e.clientX-cameraPan.x)*unitPerPixel;
    const moveY=(e.clientY-cameraPan.y)*unitPerPixel;
    camera.position.x-=moveX;camera.position.y+=moveY;
    controls.target.x-=moveX;controls.target.y+=moveY;
    cameraPan.x=e.clientX;cameraPan.y=e.clientY;
    controls.update();
    return;
  }
  if(measurementHit){hideQuickBuild();canvas.style.cursor=measurementHit.handle?'grab':'pointer';return;}
  updateQuickBuild(e);
});
canvas.addEventListener('pointerleave',()=>{ if(!measurementHandleDrag&&!creatingMeasurement){measurementCursor.visible=false;setHoveredMeasurement(null);if(!cameraPan)hideQuickBuild();canvas.style.cursor='';} });
async function stopMoving(e){ if(!draggedMesh&&!cameraPan)return; const modelMoved=Boolean(draggedMesh); const changed=modelMoved&&dragStart&&(!draggedMesh.position.equals(dragStart.position)||draggedMesh.rotation.z!==dragStart.rotation); draggedMesh=null;dragStart=null;cameraPan=null; if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId); if(changed)await mergeCompatiblePanels(); if(modelMoved)recomputeAutoHardware(); if(changed){updateCount();recordHistory();} }
function finishPointerInteraction(event){
  if(measurementHandleDrag){updateMeasurementPointer(event);finishMeasurementHandleDrag();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);return;}
  if(creatingMeasurement){updateMeasurementPointer(event);finishMeasurementCreation();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);return;}
  if(cameraPan&&!cameraPan.moved&&quickPress){
    quickBuildCell={center:quickPress.center};
    const choice=updateQuickBuild(event);
    if(choice&&choice.id===quickPress.id&&choice.part.file===quickPress.file&&choice.rotation===quickPress.rotation&&quickBuildCell.center.distanceTo(quickPress.center)<.01){
      addPart(choice.part,quickBuildCell.center.clone().setZ(.55));
      hideQuickBuild();
    }
  }
  quickPress=null;
  stopMoving(event);
}
function cancelPointerInteraction(event){ quickPress=null; hideQuickBuild(); if(measurementHandleDrag){ const measurement=measurementHandleDrag.measurement; if(measurementHandleDrag.handle==='start')measurement.start.copy(measurementHandleDrag.original); updateMeasurementVisual(measurement,measurementHandleDrag.handle==='end'?measurementHandleDrag.original:measurement.end); measurementHandleDrag=null; measurementGrid.visible=state.measureMode; hideMeasurementGuides(); canvas.style.cursor=''; } else if(creatingMeasurement)cancelMeasurementDraft(); else stopMoving(event); if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId); }
canvas.addEventListener('pointerup',finishPointerInteraction); canvas.addEventListener('pointercancel',cancelPointerInteraction);
canvas.addEventListener('contextmenu',event=>{ event.preventDefault(); const measurementHit=findMeasurementHit(event); if(measurementHit){ const index=measurements.indexOf(measurementHit.measurement); if(index>=0)measurements.splice(index,1); removeMeasurementVisual(measurementHit.measurement); canvas.style.cursor=''; updateMeasurementControls(); recordHistory(); return; } if(state.measureMode){cancelMeasurementDraft();return;} const rect=canvas.getBoundingClientRect(); pointer.x=((event.clientX-rect.left)/rect.width)*2-1; pointer.y=-((event.clientY-rect.top)/rect.height)*2+1; raycaster.setFromCamera(pointer,camera); const hit=raycaster.intersectObjects(placed.children)[0]; if(!hit)return; const mesh=hit.object; state.selection.delete(mesh);placed.remove(mesh); mesh.material.dispose(); updateCount(); recomputeAutoHardware();recordHistory(); });
document.querySelector('#clear-board').onclick=()=>{hideQuickBuild();select(null);for(const mesh of [...placed.children]){placed.remove(mesh);mesh.material.dispose();}autoConnectors.clear();autoRings.clear();connectorRevision++;ringRevision++;measurements.splice(0).forEach(removeMeasurementVisual);cancelMeasurementDraft();updateCount();recomputeAutoHardware();recordHistory();};

// Build plate generation -----------------------------------------------------
const plateDialog=document.querySelector('#plate-dialog');
const plateEditorDialog=document.querySelector('#plate-editor-dialog');
const plateResults=document.querySelector('#plate-results');
const plateNotice=document.querySelector('#plate-notice');
const plateExportActions=document.querySelector('#plate-export-actions');
const plateSummary=document.querySelector('#plate-summary');
const plateProgress=document.querySelector('#plate-progress');
const plateProgressBar=document.querySelector('#plate-progress-bar');
const plateProgressLabel=document.querySelector('#plate-progress-label');
const plateProgressValue=document.querySelector('#plate-progress-value');
const plateInputs={
  width:document.querySelector('#plate-width'),
  depth:document.querySelector('#plate-depth'),
  spacing:document.querySelector('#plate-spacing'),
  brim:document.querySelector('#plate-brim')
};
const plateEditorCanvas=document.querySelector('#plate-editor-canvas');
const plateEditorContext=plateEditorCanvas.getContext('2d');
const plateSelectionEmpty=document.querySelector('#plate-selection-empty');
const plateSelectionControls=document.querySelector('#plate-selection-controls');
const plateSelectionName=document.querySelector('#plate-selection-name');
const plateSelectionAngle=document.querySelector('#plate-selection-angle');
const plateSelectionLock=document.querySelector('#plate-selection-lock');
const plateEditorStatus=document.querySelector('#plate-editor-status');
const plateGeneratorState={uniquePlates:[],options:null,editor:null,running:false};
const PLATE_STORAGE_KEY='superskadis-build-plate-settings';
const PACKING_ANGLES=[0,45,90,135,180,225,270,315];

function loadPlateSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(PLATE_STORAGE_KEY)||'null');
    if(!saved)return;
    Object.entries(plateInputs).forEach(([key,input])=>{if(Number.isFinite(saved[key]))input.value=saved[key];});
  }catch{}
}
function readPlateOptions(){
  const options={width:Number(plateInputs.width.value),depth:Number(plateInputs.depth.value),spacing:Number(plateInputs.spacing.value),brim:Number(plateInputs.brim.value)};
  if(!Number.isFinite(options.width)||options.width<=200||!Number.isFinite(options.depth)||options.depth<=200)throw new Error('Both bed dimensions must be greater than 200 mm.');
  if(!Number.isFinite(options.spacing)||options.spacing<0||!Number.isFinite(options.brim)||options.brim<0)throw new Error('Gap and brim values cannot be negative.');
  localStorage.setItem(PLATE_STORAGE_KEY,JSON.stringify(options));
  return options;
}
loadPlateSettings();
Object.values(plateInputs).forEach(input=>input.addEventListener('change',()=>{try{readPlateOptions();}catch{}}));

function setPlateProgress(value,label){
  const progress=Math.max(0,Math.min(100,Math.round(value)));
  plateProgress.hidden=false;
  plateProgressBar.value=progress;
  plateProgressValue.textContent=`${progress}%`;
  plateProgressLabel.textContent=label;
}
function hidePlateProgress(){plateProgress.hidden=true;}
function showPlateNotice(message,error=false){plateNotice.textContent=message;plateNotice.classList.toggle('error',error);plateNotice.hidden=false;}
function hidePlateNotice(){plateNotice.hidden=true;plateNotice.classList.remove('error');}
function nextFrame(){return new Promise(resolve=>requestAnimationFrame(resolve));}

function collectBomCounts(){
  const structural=new Map();
  const connections=new Map();
  placed.children.forEach(mesh=>addBomPart(['Structure','Angle'].includes(mesh.userData.part?.category)?structural:connections,mesh.userData.part));
  autoConnectors.children.forEach(mesh=>addBomPart(connections,mesh.userData.part));
  autoRings.children.forEach(mesh=>addBomPart(connections,mesh.userData.part));
  return {structural,connections};
}
function polygonArea(points){
  let area=0;
  for(let index=0;index<points.length;index++){const next=points[(index+1)%points.length];area+=points[index].x*next.y-next.x*points[index].y;}
  return Math.abs(area)/2;
}
function convexHull(points){
  const unique=[...new Map(points.map(point=>[`${point.x.toFixed(2)}:${point.y.toFixed(2)}`,point])).values()].sort((first,second)=>first.x-second.x||first.y-second.y);
  if(unique.length<=2)return unique;
  const cross=(origin,first,second)=>(first.x-origin.x)*(second.y-origin.y)-(first.y-origin.y)*(second.x-origin.x);
  const lower=[];
  unique.forEach(point=>{while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],point)<=0)lower.pop();lower.push(point);});
  const upper=[];
  for(let index=unique.length-1;index>=0;index--){const point=unique[index];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],point)<=0)upper.pop();upper.push(point);}
  lower.pop();upper.pop();
  return lower.concat(upper);
}
function footprintFromGeometry(geometry){
  if(geometry.userData.packingHull)return geometry.userData.packingHull;
  const position=geometry.attributes.position;
  const points=[];
  for(let index=0;index<position.count;index++)points.push({x:position.getX(index)/STL_UNIT_SCALE,y:position.getY(index)/STL_UNIT_SCALE});
  return geometry.userData.packingHull=convexHull(points);
}
async function createPackingItems(counts,kind){
  const items=[];
  for(const [file,quantity] of counts){
    const part=parts.find(candidate=>candidate.file===file);
    if(!part)continue;
    const geometry=await getGeometry(part);
    const hull=footprintFromGeometry(geometry);
    const area=polygonArea(hull);
    for(let index=0;index<quantity;index++)items.push({id:`${kind}:${file}:${index}`,part,geometry,hull,area,kind});
  }
  return items;
}
function rotatedPoints(points,angle){
  const radians=THREE.MathUtils.degToRad(angle);
  const cos=Math.cos(radians);const sin=Math.sin(radians);
  return points.map(point=>({x:point.x*cos-point.y*sin,y:point.x*sin+point.y*cos}));
}
function boundsForPoints(points){
  return points.reduce((bounds,point)=>({minX:Math.min(bounds.minX,point.x),maxX:Math.max(bounds.maxX,point.x),minY:Math.min(bounds.minY,point.y),maxY:Math.max(bounds.maxY,point.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
}
const packingRotations=new WeakMap();
function packingRotation(item,angle){
  let cache=packingRotations.get(item.hull);
  if(!cache){cache=new Map();packingRotations.set(item.hull,cache);}
  if(!cache.has(angle)){const points=rotatedPoints(item.hull,angle);cache.set(angle,{points,bounds:boundsForPoints(points)});}
  return cache.get(angle);
}
function refreshPlacement(placement){
  const local=packingRotation(placement.item,placement.angle).points;
  placement.points=local.map(point=>({x:point.x+placement.x,y:point.y+placement.y}));
  placement.bounds=boundsForPoints(placement.points);
  return placement;
}
function pointToSegmentDistance(point,start,end){
  const dx=end.x-start.x;const dy=end.y-start.y;
  if(!dx&&!dy)return Math.hypot(point.x-start.x,point.y-start.y);
  const amount=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(point.x-(start.x+amount*dx),point.y-(start.y+amount*dy));
}
function orientation(first,second,third){return (second.x-first.x)*(third.y-first.y)-(second.y-first.y)*(third.x-first.x);}
function segmentsIntersect(firstStart,firstEnd,secondStart,secondEnd){
  const firstA=orientation(firstStart,firstEnd,secondStart);const firstB=orientation(firstStart,firstEnd,secondEnd);
  const secondA=orientation(secondStart,secondEnd,firstStart);const secondB=orientation(secondStart,secondEnd,firstEnd);
  return firstA*firstB<0&&secondA*secondB<0;
}
function polygonsConflict(first,second,clearance){
  const firstBounds=first.bounds;const secondBounds=second.bounds;
  if(firstBounds.maxX+clearance<=secondBounds.minX||secondBounds.maxX+clearance<=firstBounds.minX||firstBounds.maxY+clearance<=secondBounds.minY||secondBounds.maxY+clearance<=firstBounds.minY)return false;
  if(pointInsidePolygon(first.points[0],second.points)||pointInsidePolygon(second.points[0],first.points))return true;
  let minimum=Infinity;
  for(let firstIndex=0;firstIndex<first.points.length;firstIndex++){
    const firstStart=first.points[firstIndex];const firstEnd=first.points[(firstIndex+1)%first.points.length];
    for(let secondIndex=0;secondIndex<second.points.length;secondIndex++){
      const secondStart=second.points[secondIndex];const secondEnd=second.points[(secondIndex+1)%second.points.length];
      if(segmentsIntersect(firstStart,firstEnd,secondStart,secondEnd))return true;
      minimum=Math.min(minimum,pointToSegmentDistance(firstStart,secondStart,secondEnd),pointToSegmentDistance(secondStart,firstStart,firstEnd));
      if(minimum<clearance)return true;
    }
  }
  return minimum<clearance;
}
function placementFits(placement,plate,options,ignore=null){
  const halfWidth=options.width/2;const halfDepth=options.depth/2;
  if(placement.bounds.minX< -halfWidth+options.brim||placement.bounds.maxX>halfWidth-options.brim||placement.bounds.minY< -halfDepth+options.brim||placement.bounds.maxY>halfDepth-options.brim)return false;
  const clearance=options.spacing+options.brim*2;
  return !plate.placements.some(other=>other!==ignore&&polygonsConflict(placement,other,clearance));
}
function* placementCandidates(localBounds,plate,options,step,scan=false){
  const minimumX=-options.width/2+options.brim-localBounds.minX;
  const maximumX=options.width/2-options.brim-localBounds.maxX;
  const minimumY=-options.depth/2+options.brim-localBounds.minY;
  const maximumY=options.depth/2-options.brim-localBounds.maxY;
  if(minimumX>maximumX||minimumY>maximumY)return;
  const clearance=options.spacing+options.brim*2;
  const xs=new Set([minimumX,maximumX]);const ys=new Set([minimumY,maximumY]);
  plate.placements.forEach(placement=>{
    xs.add(placement.bounds.maxX+clearance-localBounds.minX);xs.add(placement.bounds.minX-clearance-localBounds.maxX);
    ys.add(placement.bounds.maxY+clearance-localBounds.minY);ys.add(placement.bounds.minY-clearance-localBounds.maxY);
  });
  const candidates=[];
  [...ys].filter(value=>value>=minimumY-.01&&value<=maximumY+.01).forEach(y=>[...xs].filter(value=>value>=minimumX-.01&&value<=maximumX+.01).forEach(x=>candidates.push({x,y})));
  candidates.sort((first,second)=>first.y-second.y||first.x-second.x);
  yield* candidates;
  if(!scan||!plate.placements.length)return;
  for(let y=minimumY;y<=maximumY+.01;y+=step){for(let x=minimumX;x<=maximumX+.01;x+=step)yield {x,y};}
}
function findPlacement(item,plate,options,step,angleOffset=0){
  let best=null;
  const angles=PACKING_ANGLES.map((_,index)=>PACKING_ANGLES[(index+angleOffset)%PACKING_ANGLES.length]);
  // Try contact positions in every orientation before resorting to a grid scan.
  for(const scan of [false,true]){
  for(const angle of angles){
    const localBounds=packingRotation(item,angle).bounds;
    const candidates=placementCandidates(localBounds,plate,options,step,scan);
    for(const candidate of candidates){
      const placement=refreshPlacement({item,x:candidate.x,y:candidate.y,angle,locked:false});
      if(!placementFits(placement,plate,options))continue;
      const occupied=plate.placements.length?boundsForPoints(plate.placements.flatMap(existing=>existing.points).concat(placement.points)):placement.bounds;
      const score=(occupied.maxY-occupied.minY)*options.width+(occupied.maxX-occupied.minX);
      if(!best||score<best.score)best={placement,score};
      break;
    }
  }
  if(best)break;
  }
  return best?.placement||null;
}
function seededRandom(seed){let value=seed||1;return()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};}
function orderedItems(items,attempt){
  const list=[...items];
  if(attempt===0)return list.sort((a,b)=>b.area-a.area);
  if(attempt===1)return list.sort((a,b)=>Math.max(...b.hull.map(point=>Math.hypot(point.x,point.y)))-Math.max(...a.hull.map(point=>Math.hypot(point.x,point.y))));
  const random=seededRandom(attempt*7919+items.length);
  return list.sort((a,b)=>(b.area-a.area)*(attempt%3===0?1:.2)+(random()-.5)*Math.max(a.area,b.area));
}
function centerPlateContents(plate){
  if(!plate.placements.length)return plate;
  const bounds=boundsForPoints(plate.placements.flatMap(placement=>placement.points));
  const offsetX=-(bounds.minX+bounds.maxX)/2;
  const offsetY=-(bounds.minY+bounds.maxY)/2;
  plate.placements.forEach(placement=>{placement.x+=offsetX;placement.y+=offsetY;refreshPlacement(placement);});
  return plate;
}
async function packItemGroup(items,kind,options,attempt,step,onProgress=()=>{}){
  // Hardware usually fits a single bed. A rectangular row layout proves that
  // optimum immediately, without hundreds of polygon searches. If it fails,
  // retain the general packer so extra plates are not created prematurely.
  if(kind==='connections'&&items.length){
    const fast=packHardwareRows(items,options);
    if(fast){onProgress(1);await nextFrame();return [centerPlateContents(fast)];}
  }
  const plates=[];
  const availableArea=(options.width-2*options.brim)*(options.depth-2*options.brim);
  // Hull area is the area reserved by our collision test. Only classify a part
  // as solitary when no remaining type can share that area, regardless of rotation.
  const smallestArea=items.reduce((minimum,item)=>Math.min(minimum,item.area),Infinity);
  const placementsCache=new Map();
  const layoutKey=plate=>plate.placements.map(p=>`${p.item.part.file}:${p.x}:${p.y}:${p.angle}`).join('|');
  function cachedPlacement(item,plate){
    const key=`${item.part.file}|${plate.layoutKey||''}`;
    if(!placementsCache.has(key)){
      const found=findPlacement(item,plate,options,step,attempt%8);
      placementsCache.set(key,found?{x:found.x,y:found.y,angle:found.angle}:null);
    }
    const result=placementsCache.get(key);
    return result?refreshPlacement({item,...result,locked:false}):null;
  }
  let processed=0;let lastYield=performance.now();
  for(const item of orderedItems(items,attempt)){
    let chosen=null;let chosenPlate=null;
    const solitary=item.area+smallestArea>availableArea+1e-6;
    for(const plate of plates){
      if(solitary||plate.solitary||plate.usedArea+item.area>availableArea+1e-6)continue;
      const candidate=cachedPlacement(item,plate);
      if(candidate){chosen=candidate;chosenPlate=plate;break;}
    }
    if(!chosen){
      chosenPlate={kind,placements:[],usedArea:0,solitary};
      chosen=cachedPlacement(item,chosenPlate);
      if(!chosen)throw new Error(`${item.part.name} does not fit on a ${formatMillimetres(options.width)} × ${formatMillimetres(options.depth)} mm bed with the selected brim.`);
      plates.push(chosenPlate);
    }
    chosenPlate.placements.push(chosen);
    chosenPlate.usedArea+=item.area;
    chosenPlate.layoutKey=layoutKey(chosenPlate);
    processed++;
    if(performance.now()-lastYield>20){onProgress(processed/items.length);await nextFrame();lastYield=performance.now();}
  }
  plates.forEach(centerPlateContents);
  return plates;
}
function packHardwareRows(items,options){
  const plate={kind:'connections',placements:[]};
  const gap=options.spacing+2*options.brim;
  const left=-options.width/2+options.brim,right=options.width/2-options.brim;
  const bottom=-options.depth/2+options.brim,top=options.depth/2-options.brim;
  const shapes=items.map(item=>{
    const choices=PACKING_ANGLES.map(angle=>{const bounds=packingRotation(item,angle).bounds;return {angle,bounds,width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY};})
      .filter(shape=>shape.width<=right-left&&shape.height<=top-bottom)
      .sort((a,b)=>a.height-b.height||a.width-b.width);
    return {item,shape:choices[0]};
  });
  if(shapes.some(entry=>!entry.shape))return null;
  shapes.sort((a,b)=>b.shape.height-a.shape.height||b.shape.width-a.shape.width);
  let x=left,y=bottom,rowHeight=0;
  for(const {item,shape} of shapes){
    if(x+shape.width>right+1e-7){x=left;y+=rowHeight+gap;rowHeight=0;}
    if(y+shape.height>top+1e-7)return null;
    plate.placements.push(refreshPlacement({item,x:x-shape.bounds.minX,y:y-shape.bounds.minY,angle:shape.angle,locked:false}));
    x+=shape.width+gap;rowHeight=Math.max(rowHeight,shape.height);
  }
  return plate;
}
function packingScore(plates){
  const compactness=plates.reduce((sum,plate)=>{if(!plate.placements.length)return sum;const bounds=boundsForPoints(plate.placements.flatMap(placement=>placement.points));return sum+(bounds.maxX-bounds.minX)*(bounds.maxY-bounds.minY);},0);
  return plates.length*1e12+compactness;
}
function groupRepeatedPlates(plates){
  const groups=new Map();
  plates.forEach(plate=>{
    const counts=new Map();plate.placements.forEach(placement=>counts.set(placement.item.part.file,(counts.get(placement.item.part.file)||0)+1));
    const signature=`${plate.kind}|${[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([file,count])=>`${file}:${count}`).join('|')}`;
    if(groups.has(signature)){groups.get(signature).multiplier++;return;}
    groups.set(signature,{...plate,multiplier:1,signature});
  });
  return [...groups.values()];
}
function balanceHalfPanelPlates(plates,options){
  const vertical='180 vertical.stl';
  const horizontal='180 horizontal.stl';
  const halfFiles=new Set([vertical,horizontal]);
  const indices=[];
  const items=new Map([[vertical,[]],[horizontal,[]]]);
  const templates=new Map();
  const pairKey=(first,second)=>[first,second].sort().join('|');
  plates.forEach((plate,index)=>{
    if(plate.kind!=='structural'||plate.placements.length!==2||!plate.placements.every(placement=>halfFiles.has(placement.item.part.file)))return;
    indices.push(index);
    const files=plate.placements.map(placement=>placement.item.part.file);
    templates.set(pairKey(...files),plate);
    plate.placements.forEach(placement=>items.get(placement.item.part.file).push(placement.item));
  });
  const verticalItems=items.get(vertical);
  const horizontalItems=items.get(horizontal);
  const mixedCount=Math.min(verticalItems.length,horizontalItems.length);
  if(indices.length<2||!mixedCount)return plates;
  const desired=[];
  for(let index=0;index<mixedCount;index++)desired.push([vertical,horizontal]);
  for(let index=mixedCount;index<verticalItems.length;index+=2)desired.push([vertical,vertical]);
  for(let index=mixedCount;index<horizontalItems.length;index+=2)desired.push([horizontal,horizontal]);
  if(desired.length!==indices.length)return plates;
  for(const [firstFile,secondFile] of desired){
    const key=pairKey(firstFile,secondFile);
    if(templates.has(key))continue;
    const first=items.get(firstFile)[0];
    const second=items.get(secondFile)[firstFile===secondFile?1:0];
    let template=null;
    for(const order of [[first,second],[second,first]]){
      const candidate={kind:'structural',placements:[]};
      const firstPlacement=findPlacement(order[0],candidate,options,2);
      if(!firstPlacement)continue;
      candidate.placements.push(firstPlacement);
      const secondPlacement=findPlacement(order[1],candidate,options,2);
      if(!secondPlacement)continue;
      candidate.placements.push(secondPlacement);
      template=centerPlateContents(candidate);
      break;
    }
    if(!template)return plates;
    templates.set(key,template);
  }
  const queues=new Map([[vertical,[...verticalItems]],[horizontal,[...horizontalItems]]]);
  const replacements=desired.map(([firstFile,secondFile])=>{
    const template=templates.get(pairKey(firstFile,secondFile));
    const placements=template.placements.map(original=>{
      const item=queues.get(original.item.part.file).shift();
      return refreshPlacement({item,x:original.x,y:original.y,angle:original.angle,locked:false});
    });
    return {kind:'structural',placements,usedArea:placements.reduce((sum,placement)=>sum+placement.item.area,0),solitary:false};
  });
  const balanced=[...plates];
  indices.forEach((index,position)=>{balanced[index]=replacements[position];});
  return balanced;
}
async function generateBuildPlates(deep=false){
  if(plateGeneratorState.running)return;
  plateGeneratorState.running=true;
  document.querySelector('#generate-plates').disabled=true;document.querySelector('#optimize-plates').disabled=true;
  hidePlateNotice();plateExportActions.hidden=true;plateResults.replaceChildren();
  try{
    const options=readPlateOptions();
    setPlateProgress(2,'Updating project hardware…');
    await Promise.all([recomputeAutoConnectors(),recomputeAutoRings()]);
    const counts=collectBomCounts();
    if(!counts.structural.size&&!counts.connections.size)throw new Error('Add at least one part to the board before generating build plates.');
    setPlateProgress(8,'Reading model footprints…');
    const [structuralItems,connectionItems]=await Promise.all([createPackingItems(counts.structural,'structural'),createPackingItems(counts.connections,'connections')]);
    const attempts=deep?12:4;const step=deep?2:4;
    let best=null;let bestScore=Infinity;
    for(let attempt=0;attempt<attempts;attempt++){
      const progress=12+(attempt/attempts)*78;
      setPlateProgress(progress,`Testing layout ${attempt+1} of ${attempts}…`);
      await nextFrame();
      const totalItems=structuralItems.length+connectionItems.length;
      const report=(done,label)=>setPlateProgress(progress+done/totalItems*78/attempts,`${label} · layout ${attempt+1}/${attempts}`);
      const structuralPlates=await packItemGroup(structuralItems,'structural',options,attempt,step,fraction=>report(fraction*structuralItems.length,'Packing panels'));
      const connectionPlates=await packItemGroup(connectionItems,'connections',options,attempt,step,fraction=>report(structuralItems.length+fraction*connectionItems.length,'Packing connections'));
      const candidate=[...balanceHalfPanelPlates(structuralPlates,options),...connectionPlates];
      const score=packingScore(candidate);
      if(score<bestScore){best=candidate;bestScore=score;}
      const usableArea=(options.width-2*options.brim)*(options.depth-2*options.brim);
      const lowerBound=group=>Math.ceil(group.reduce((sum,item)=>sum+item.area,0)/usableArea-1e-9);
      if(!deep&&candidate.length===lowerBound(structuralItems)+lowerBound(connectionItems))break;
    }
    setPlateProgress(94,'Grouping repeated plates…');await nextFrame();
    plateGeneratorState.options=options;
    plateGeneratorState.uniquePlates=groupRepeatedPlates(best);
    renderPlateResults();
    setPlateProgress(100,'Build plates ready');
    setTimeout(()=>{if(!plateGeneratorState.running)hidePlateProgress();},500);
  }catch(error){plateGeneratorState.uniquePlates=[];showPlateNotice(error.message||'Could not generate build plates.',true);hidePlateProgress();}
  finally{plateGeneratorState.running=false;document.querySelector('#generate-plates').disabled=false;document.querySelector('#optimize-plates').disabled=false;}
}

function plateContentText(plate){
  const counts=new Map();plate.placements.forEach(placement=>counts.set(placement.item.part.name,(counts.get(placement.item.part.name)||0)+1));
  return [...counts].map(([name,count])=>`${name} ×${count}`).join(' · ');
}
function plateValidity(plate,options){
  const invalid=new Set();
  plate.placements.forEach(placement=>{
    const halfWidth=options.width/2;const halfDepth=options.depth/2;
    if(placement.bounds.minX< -halfWidth+options.brim||placement.bounds.maxX>halfWidth-options.brim||placement.bounds.minY< -halfDepth+options.brim||placement.bounds.maxY>halfDepth-options.brim)invalid.add(placement);
  });
  const clearance=options.spacing+options.brim*2;
  for(let first=0;first<plate.placements.length;first++)for(let second=first+1;second<plate.placements.length;second++)if(polygonsConflict(plate.placements[first],plate.placements[second],clearance)){invalid.add(plate.placements[first]);invalid.add(plate.placements[second]);}
  return invalid;
}
const plateModelSprites=new WeakMap();
function plateModelSprite(geometry,color){
  let cache=plateModelSprites.get(geometry);
  if(!cache){cache=new Map();plateModelSprites.set(geometry,cache);}
  if(cache.has(color))return cache.get(color);
  const bounds=boundsForPoints(footprintFromGeometry(geometry));
  const width=Math.max(.001,bounds.maxX-bounds.minX),height=Math.max(.001,bounds.maxY-bounds.minY);
  const scale=512/Math.max(width,height);
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*scale));canvas.height=Math.max(1,Math.ceil(height*scale));
  const context=canvas.getContext('2d');context.fillStyle=color;
  const position=geometry.attributes.position;
  for(let vertex=0;vertex+2<position.count;vertex+=3){
    context.beginPath();
    for(let offset=0;offset<3;offset++){
      const x=(position.getX(vertex+offset)/STL_UNIT_SCALE-bounds.minX)*scale;
      const y=(bounds.maxY-position.getY(vertex+offset)/STL_UNIT_SCALE)*scale;
      if(!offset)context.moveTo(x,y);else context.lineTo(x,y);
    }
    context.closePath();context.fill();
  }
  const sprite={canvas,bounds,width:canvas.width/scale,height:canvas.height/scale};cache.set(color,sprite);return sprite;
}
function drawPlate(canvas,plate,options,selected=null,renderModelSurfaces=false){
  const rect=canvas.getBoundingClientRect();const pixelRatio=Math.min(devicePixelRatio||1,2);
  const cssWidth=Math.max(180,rect.width||500);const cssHeight=Math.max(130,rect.height||340);
  canvas.width=Math.round(cssWidth*pixelRatio);canvas.height=Math.round(cssHeight*pixelRatio);
  const context=canvas.getContext('2d');context.setTransform(pixelRatio,0,0,pixelRatio,0,0);context.clearRect(0,0,cssWidth,cssHeight);
  const padding=18;const scale=Math.min((cssWidth-padding*2)/options.width,(cssHeight-padding*2)/options.depth);
  const offsetX=cssWidth/2;const offsetY=cssHeight/2;
  const toCanvas=point=>({x:offsetX+point.x*scale,y:offsetY-point.y*scale});
  context.fillStyle='#101b17';context.strokeStyle='#52665e';context.lineWidth=1;
  context.fillRect(offsetX-options.width*scale/2,offsetY-options.depth*scale/2,options.width*scale,options.depth*scale);
  context.strokeRect(offsetX-options.width*scale/2+.5,offsetY-options.depth*scale/2+.5,options.width*scale-1,options.depth*scale-1);
  context.setLineDash([4,4]);context.strokeStyle='#6f863c';
  context.strokeRect(offsetX-(options.width/2-options.brim)*scale,offsetY-(options.depth/2-options.brim)*scale,(options.width-options.brim*2)*scale,(options.depth-options.brim*2)*scale);context.setLineDash([]);
  context.strokeStyle='#344840';context.beginPath();context.moveTo(offsetX,offsetY-options.depth*scale/2);context.lineTo(offsetX,offsetY+options.depth*scale/2);context.moveTo(offsetX-options.width*scale/2,offsetY);context.lineTo(offsetX+options.width*scale/2,offsetY);context.stroke();
  const invalid=plateValidity(plate,options);
  plate.placements.forEach(placement=>{
    const fillColor=invalid.has(placement)?'#e55252':placement===selected?'#f7b06f':plate.kind==='connections'?'#c8ef45':'#f46f47';
    if(renderModelSurfaces){
      const sprite=plateModelSprite(placement.item.geometry,fillColor);
      const origin=toCanvas(placement);
      context.save();context.translate(origin.x,origin.y);context.rotate(-THREE.MathUtils.degToRad(placement.angle));context.globalAlpha=.86;
      context.drawImage(sprite.canvas,sprite.bounds.minX*scale,-sprite.bounds.maxY*scale,sprite.width*scale,sprite.height*scale);context.restore();
    }else{
      const first=toCanvas(placement.points[0]);context.beginPath();context.moveTo(first.x,first.y);
      placement.points.slice(1).forEach(point=>{const mapped=toCanvas(point);context.lineTo(mapped.x,mapped.y);});context.closePath();
      context.fillStyle=fillColor;context.globalAlpha=.82;context.fill();context.globalAlpha=1;
    }
    const first=toCanvas(placement.points[0]);context.beginPath();context.moveTo(first.x,first.y);placement.points.slice(1).forEach(point=>{const mapped=toCanvas(point);context.lineTo(mapped.x,mapped.y);});context.closePath();
    context.strokeStyle=placement===selected?'#ffffff':'#0a100e';context.lineWidth=placement===selected?2:1;context.stroke();
    if(placement.locked){const center=toCanvas({x:placement.x,y:placement.y});context.fillStyle='#ffffff';context.font='10px sans-serif';context.fillText('●',center.x-3,center.y+3);}
  });
  return {scale,offsetX,offsetY,width:cssWidth,height:cssHeight};
}
function renderPlateResults(){
  const plates=plateGeneratorState.uniquePlates;const options=plateGeneratorState.options;
  hidePlateNotice();plateResults.replaceChildren();
  plates.forEach((plate,index)=>{
    const card=document.createElement('article');card.className='plate-card';
    const preview=document.createElement('div');preview.className='plate-card-preview';
    const canvas=document.createElement('canvas');
    const multiplier=document.createElement('span');multiplier.className='plate-multiplier';multiplier.textContent=`×${plate.multiplier}`;
    preview.append(canvas,multiplier);
    const copy=document.createElement('div');copy.className='plate-card-copy';
    const heading=document.createElement('div');heading.className='plate-card-heading';
    const title=document.createElement('h3');title.textContent=`Plate ${index+1} · ${plate.kind==='structural'?'Structural':'Connections'}`;
    const quantity=document.createElement('small');quantity.textContent=`${plate.placements.length} parts`;
    heading.append(title,quantity);
    const content=document.createElement('p');content.className='plate-card-content';content.textContent=plateContentText(plate);
    const actions=document.createElement('div');actions.className='plate-card-actions';
    const edit=document.createElement('button');edit.type='button';edit.className='button';edit.textContent='Edit manually';edit.onclick=()=>openPlateEditor(index);
    const download=document.createElement('button');download.type='button';download.className='button';download.textContent='Download STL';download.onclick=()=>downloadPlate(index);
    actions.append(edit,download);copy.append(heading,content,actions);card.append(preview,copy);plateResults.append(card);
    requestAnimationFrame(()=>drawPlate(canvas,plate,options,null,true));
  });
  const total=plates.reduce((sum,plate)=>sum+plate.multiplier,0);
  plateSummary.textContent=`${plates.length} unique STL ${plates.length===1?'plate':'plates'} · ${total} total ${total===1?'print':'prints'}`;
  plateExportActions.hidden=false;
  document.querySelector('#save-plates-folder').hidden=!('showDirectoryPicker' in window);
}

function plateFileName(index,plate){return `plate-${String(index+1).padStart(2,'0')}-${plate.kind}${plate.multiplier>1?`-x${plate.multiplier}`:''}.stl`;}
function createPlateBlob(plate){
  const root=new THREE.Group();
  plate.placements.forEach(placement=>{
    placement.item.geometry.computeBoundingBox();
    const mesh=new THREE.Mesh(placement.item.geometry);
    mesh.position.set(placement.x*STL_UNIT_SCALE,placement.y*STL_UNIT_SCALE,-placement.item.geometry.boundingBox.min.z);
    mesh.rotation.z=THREE.MathUtils.degToRad(placement.angle);
    root.add(mesh);
  });
  root.scale.setScalar(1/STL_UNIT_SCALE);root.updateMatrixWorld(true);
  const data=new STLExporter().parse(root,{binary:true});
  return new Blob([data],{type:'model/stl'});
}
function triggerDownload(blob,name){
  const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function downloadPlate(index){const plate=plateGeneratorState.uniquePlates[index];if(plate)triggerDownload(createPlateBlob(plate),plateFileName(index,plate));}
function downloadAllPlates(){plateGeneratorState.uniquePlates.forEach((_,index)=>downloadPlate(index));}
async function savePlatesToFolder(){
  if(!window.showDirectoryPicker)return;
  try{
    const directory=await window.showDirectoryPicker({mode:'readwrite'});
    for(let index=0;index<plateGeneratorState.uniquePlates.length;index++){
      const plate=plateGeneratorState.uniquePlates[index];const handle=await directory.getFileHandle(plateFileName(index,plate),{create:true});const writable=await handle.createWritable();await writable.write(createPlateBlob(plate));await writable.close();
    }
  }catch(error){if(error.name!=='AbortError')showPlateNotice(`Could not save files: ${error.message}`,true);}
}

function updateEditorSelection(){
  const editor=plateGeneratorState.editor;const selected=editor?.selected||null;
  plateSelectionEmpty.hidden=Boolean(selected);plateSelectionControls.hidden=!selected;
  if(selected){plateSelectionName.textContent=selected.item.part.name;plateSelectionAngle.value=Math.round(selected.angle*10)/10;plateSelectionLock.checked=Boolean(selected.locked);}
}
function renderPlateEditor(){
  const editor=plateGeneratorState.editor;if(!editor)return;
  editor.view=drawPlate(plateEditorCanvas,editor.plate,plateGeneratorState.options,editor.selected);
  const invalid=plateValidity(editor.plate,plateGeneratorState.options);
  plateEditorStatus.textContent=invalid.size?`${invalid.size} model${invalid.size===1?' has':'s have'} a spacing or bed-boundary warning. Export remains available.`:'All models fit the selected limits.';
  plateEditorStatus.classList.toggle('invalid',invalid.size>0);updateEditorSelection();
}
function openPlateEditor(index){
  const plate=plateGeneratorState.uniquePlates[index];if(!plate)return;
  plateGeneratorState.editor={plate,index,selected:null,drag:null,view:null};
  document.querySelector('#plate-editor-title').textContent=`Edit plate ${index+1}`;
  plateEditorDialog.showModal();requestAnimationFrame(renderPlateEditor);
}
function editorPoint(event){
  const editor=plateGeneratorState.editor;const rect=plateEditorCanvas.getBoundingClientRect();const view=editor.view;
  return {x:(event.clientX-rect.left-view.offsetX)/view.scale,y:(view.offsetY-(event.clientY-rect.top))/view.scale};
}
plateEditorCanvas.addEventListener('pointerdown',event=>{
  const editor=plateGeneratorState.editor;if(!editor?.view)return;
  const point=editorPoint(event);const selected=[...editor.plate.placements].reverse().find(placement=>pointInsidePolygon(point,placement.points));
  editor.selected=selected||null;
  if(selected&&!selected.locked){editor.drag={offsetX:point.x-selected.x,offsetY:point.y-selected.y};plateEditorCanvas.setPointerCapture(event.pointerId);plateEditorCanvas.classList.add('dragging');}
  renderPlateEditor();
});
plateEditorCanvas.addEventListener('pointermove',event=>{
  const editor=plateGeneratorState.editor;if(!editor?.drag||!editor.selected)return;
  const point=editorPoint(event);editor.selected.x=point.x-editor.drag.offsetX;editor.selected.y=point.y-editor.drag.offsetY;refreshPlacement(editor.selected);renderPlateEditor();
});
function endEditorDrag(event){const editor=plateGeneratorState.editor;if(!editor?.drag)return;editor.drag=null;plateEditorCanvas.classList.remove('dragging');if(plateEditorCanvas.hasPointerCapture(event.pointerId))plateEditorCanvas.releasePointerCapture(event.pointerId);renderPlateEditor();}
plateEditorCanvas.addEventListener('pointerup',endEditorDrag);plateEditorCanvas.addEventListener('pointercancel',endEditorDrag);
plateSelectionAngle.addEventListener('input',()=>{const selected=plateGeneratorState.editor?.selected;if(!selected)return;const angle=Number(plateSelectionAngle.value);if(Number.isFinite(angle)){selected.angle=angle;refreshPlacement(selected);renderPlateEditor();}});
plateSelectionLock.addEventListener('change',()=>{const selected=plateGeneratorState.editor?.selected;if(!selected)return;selected.locked=plateSelectionLock.checked;renderPlateEditor();});
document.querySelector('#repack-plate').addEventListener('click',()=>{
  const editor=plateGeneratorState.editor;if(!editor)return;
  const original=editor.plate.placements.map(placement=>({...placement,points:placement.points.map(point=>({...point})),bounds:{...placement.bounds}}));
  const locked=editor.plate.placements.filter(placement=>placement.locked);const unlocked=editor.plate.placements.filter(placement=>!placement.locked);
  editor.plate.placements=[...locked];
  for(const placement of unlocked){const candidate=findPlacement(placement.item,editor.plate,plateGeneratorState.options,2,0);if(!candidate){editor.plate.placements=original;plateEditorStatus.textContent='The unlocked models could not be repacked around the locked positions.';plateEditorStatus.classList.add('invalid');renderPlateEditor();return;}editor.plate.placements.push(candidate);}
  if(!locked.length)centerPlateContents(editor.plate);
  editor.selected=null;renderPlateEditor();
});
new ResizeObserver(()=>{if(plateEditorDialog.open)renderPlateEditor();}).observe(plateEditorCanvas);

document.querySelector('#open-build-plates').addEventListener('click',()=>{plateDialog.showModal();generateBuildPlates(false);});
document.querySelector('#close-build-plates').addEventListener('click',()=>plateDialog.close());
document.querySelector('#close-plate-editor').addEventListener('click',()=>plateEditorDialog.close());
plateEditorDialog.addEventListener('close',()=>{if(plateGeneratorState.uniquePlates.length)renderPlateResults();});
document.querySelector('#generate-plates').addEventListener('click',()=>generateBuildPlates(false));
document.querySelector('#optimize-plates').addEventListener('click',()=>generateBuildPlates(true));
document.querySelector('#download-plates').addEventListener('click',downloadAllPlates);
document.querySelector('#save-plates-folder').addEventListener('click',savePlatesToFolder);
