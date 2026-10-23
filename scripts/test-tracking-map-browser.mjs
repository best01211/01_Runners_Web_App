// Requires temporary QA dependencies: npm install --prefix .test-output/map-qa --no-save @playwright/test esbuild
import {build} from "../.test-output/map-qa/node_modules/esbuild/lib/main.js";
import {chromium} from "../.test-output/map-qa/node_modules/@playwright/test/index.mjs";
import {createServer} from "node:http";
import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const directory=path.resolve('.test-output/map-qa');mkdirSync(directory,{recursive:true});
const leaflet=path.resolve('node_modules/leaflet/dist/leaflet-src.esm.js').replaceAll('\\','/');
const css=readFileSync('src/app/globals.css','utf8').match(/\.tracking-map \.leaflet-overlay-pane > svg \{[^}]+\}/)?.[0]??'';
writeFileSync(path.join(directory,'fixture.tsx'),`
import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';
import TrackingMap from '../../src/components/race-tracking/tracking-map';
import{DEMO_COURSE,DEMO_START,MockTimingProvider}from'../../src/lib/race-tracking/providers/mock';
import{trackRunner}from'../../src/lib/race-tracking/engine';
window.__coursePoints=DEMO_COURSE.points;function App(){const[now,setNow]=useState(DEMO_START+2700000);useEffect(()=>{const timer=setInterval(()=>setNow(n=>n+1000),100);return()=>clearInterval(timer)},[]);const p=new MockTimingProvider();const runner=p.getRunners(now)[0];const state=trackRunner(runner,p.getCheckpoints(runner.bib,now),DEMO_COURSE,now);return <><div style={{height:100}}>모바일 지도 회귀 테스트</div><TrackingMap course={DEMO_COURSE} runners={[state]} selectedId={runner.id} onSelect={()=>{}} revision={0}/><div style={{height:2000}}>아래 내용</div></>};createRoot(document.getElementById('root')!).render(<App/>);
`);
await build({entryPoints:[path.join(directory,'fixture.tsx')],bundle:true,outfile:path.join(directory,'bundle.js'),format:'esm',loader:{'.png':'dataurl'},jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'test-leaflet-observer',setup(builder){builder.onResolve({filter:/^leaflet$/},()=>({path:'leaflet-observer',namespace:'qa'}));builder.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export * from '${leaflet}';import{map as originalMap}from'${leaflet}';export function map(...args){const result=originalMap(...args);window.__trackingMap=result;return result;}`,loader:'js',resolveDir:process.cwd()}));}}]});
writeFileSync(path.join(directory,'index.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:sans-serif}.tracking-map{position:relative;overflow:hidden;background:#eee}.tracking-map>div:first-child{height:420px;width:100%}.tracking-map>button,.tracking-map>p{display:none}${css}</style><div id="root"></div><script type="module" src="/bundle.js"></script>`);
const server=createServer((request,response)=>{const name=request.url==='/'?'index.html':request.url.slice(1);if(!['index.html','bundle.js','bundle.css'].includes(name)){response.writeHead(404);response.end();return;}response.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');response.end(readFileSync(path.join(directory,name)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 const executablePath=process.env.CHROME_PATH??['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let tileRequests=0;
 await page.route('https://tile.openstreetmap.org/**',route=>{tileRequests++;return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eef0ed"/></svg>'});});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForSelector('.tracking-runner-marker');await page.waitForFunction(()=>window.__trackingMap?.getZoom()>0);
 const client=await context.newCDPSession(page);
 const touch=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id,radiusX:4,radiusY:4,force:1}))});
 const before=await page.evaluate(()=>({lat:window.__trackingMap.getCenter().lat,lng:window.__trackingMap.getCenter().lng}));
 await touch('touchStart',[[180,390]]);for(let i=1;i<=12;i++){await touch('touchMove',[[180,390-i*17]]);await page.waitForTimeout(20);}await touch('touchEnd',[]);await page.waitForTimeout(150);
 assert.ok(await page.evaluate(()=>scrollY)>80,'one finger must scroll the page');
 const after=await page.evaluate(()=>({lat:window.__trackingMap.getCenter().lat,lng:window.__trackingMap.getCenter().lng}));assert.deepEqual(after,before,'one finger must not pan the map');
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);
 const initialZoom=await page.evaluate(()=>window.__trackingMap.getZoom());let maxError=0;
 await touch('touchStart',[[145,300],[245,300]]);
 for(let i=1;i<=14;i++){
  await touch('touchMove',[[145-i*5,300],[245+i*5,300]]);await page.waitForTimeout(35);
  const error=await page.evaluate(()=>{const map=window.__trackingMap;let marker;map.eachLayer(layer=>{if(layer.options?.className==='tracking-runner-marker')marker=layer});const element=document.querySelector('.tracking-runner-marker'),rect=element.getBoundingClientRect(),container=map.getContainer().getBoundingClientRect(),expected=map.latLngToContainerPoint(marker.getLatLng());return Math.hypot(rect.x+rect.width/2-container.x-expected.x,rect.y+rect.height/2-container.y-expected.y);});maxError=Math.max(maxError,error);
 }
 await touch('touchEnd',[]);await page.waitForTimeout(400);
 assert.ok(await page.evaluate(()=>window.__trackingMap.getZoom())>initialZoom+.5,'two fingers must pinch zoom');
 assert.ok(maxError<5,`marker must stay at its projected position during zoom; error ${maxError}`);
 const tilesBefore=tileRequests;const centerBefore=await page.evaluate(()=>window.__trackingMap.getCenter().lng);
 await touch('touchStart',[[145,300],[245,300]]);for(let i=1;i<=10;i++){await touch('touchMove',[[145-i*8,300],[245-i*8,300]]);await page.waitForTimeout(30);
 const coverage=await page.evaluate(()=>{const map=window.__trackingMap,line=document.querySelector('.tracking-course-line'),rect=map.getContainer().getBoundingClientRect(),inverse=line.getScreenCTM().inverse();let visible=0,drawn=0;for(let k=0;k<window.__coursePoints.length;k+=5){const p=window.__coursePoints[k],point=map.latLngToContainerPoint([p.latitude,p.longitude]);if(point.x<10||point.y<10||point.x>rect.width-10||point.y>rect.height-10)continue;visible++;const local=new DOMPoint(rect.left+point.x,rect.top+point.y).matrixTransform(inverse);if(line.isPointInStroke(local))drawn++;}return visible?drawn/visible:1;});
 assert.ok(coverage>.95,`GPX must remain drawn while panning; coverage ${coverage}`);
 }await touch('touchEnd',[]);await page.waitForTimeout(250);
 assert.notEqual(await page.evaluate(()=>window.__trackingMap.getCenter().lng),centerBefore,'two fingers must pan');
 assert.ok(await page.locator('.tracking-course-line').evaluate(element=>element.getTotalLength())>0,'course must remain drawn');
 await page.evaluate(()=>window.__trackingMap.panBy([600,0],{animate:false}));await page.waitForTimeout(200);assert.ok(tileRequests>tilesBefore,'new tiles must load after moving the viewport');
 const zoomBeforeResize=await page.evaluate(()=>window.__trackingMap.getZoom());await page.setViewportSize({width:430,height:820});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__trackingMap.getZoom()),zoomBeforeResize,'resize must preserve the chosen zoom');
 const mouseCenter=await page.evaluate(()=>window.__trackingMap.getCenter().lng);
 await page.mouse.move(280,370);await page.mouse.down();await page.mouse.move(200,370,{steps:8});await page.mouse.up();await page.waitForTimeout(150);
 assert.notEqual(await page.evaluate(()=>window.__trackingMap.getCenter().lng),mouseCenter,'mouse dragging must still pan the map');
 await page.evaluate(()=>window.__trackingMap.fitBounds(window.__coursePoints.map(p=>[p.latitude,p.longitude]),{padding:[35,35],animate:false}));await page.waitForTimeout(200);
 await page.screenshot({path:path.join(directory,'mobile-map.png')});assert.deepEqual(errors,[]);
 console.log(`Tracking map browser checks passed: one-finger page scroll; two-finger pinch/pan; marker projection error ${maxError.toFixed(2)}px; course and tile loading; viewport resize`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
