import {build} from '../.test-output/map-qa/node_modules/esbuild/lib/main.js';
import {chromium} from '../.test-output/map-qa/node_modules/@playwright/test/index.mjs';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';import assert from 'node:assert/strict';import postcss from 'postcss';import tailwind from '@tailwindcss/postcss';
const dir=path.resolve('.test-output/participation-state');mkdirSync(dir,{recursive:true});
writeFileSync(path.join(dir,'fixture.tsx'),`import React from'react';import{createRoot}from'react-dom/client';import{ParticipationPanel}from'../../src/components/participation/participation-panel';const groups=[{pace_group_id:'g1',pace_seconds:330,distance_km:5,group_kind:'running'},{pace_group_id:'g2',pace_seconds:360,distance_km:5,group_kind:'running'}];createRoot(document.getElementById('root')).render(<div className="app-shell"><div className="main-body"><main style={{padding:16}}><ParticipationPanel currentUserId="me" initialGroupCounts={{g1:1,g2:0}} initialGroupMembers={{g1:[{userId:'a',name:'김러너'}]}} isStaff={false} scheduleId="run" scheduleType="regular" scheduleStatus="open" participantCount={1} capacity={3} registrationStartAt={null} registrationEndAt="2099-01-01" cancellationDeadlineAt={null} participation={null} canParticipate paceGroups={groups} canCreatePaceGroup/></main></div></div>);`);
await build({entryPoints:[path.join(dir,'fixture.tsx')],outfile:path.join(dir,'bundle.js'),bundle:true,format:'esm',jsx:'automatic',plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?`export function useRouter(){return{refresh(){window.__refresh=(window.__refresh||0)+1},push(){}}}`:`import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`}));}}]});
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});writeFileSync(path.join(dir,'styles.css'),css.css+'\n'+readFileSync('src/app/polish.css','utf8'));
const server=createServer((req,res)=>{const f=new URL(req.url,'http://test').pathname.slice(1);if(['bundle.js','styles.css'].includes(f)){res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(path.join(dir,f)));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script type="module" src="/bundle.js"></script>')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let phase='open';await page.clock.install();
 const schedule={status:'open',capacity:3,staff_in_capacity:false,registration_start_at:null,registration_end_at:'2099-01-01',cancellation_deadline_at:null,attendance_opened_at:null};
 const paceGroups=[{pace_group_id:'g1',pace_seconds:330,distance_km:5,group_kind:'running'},{pace_group_id:'g2',pace_seconds:360,distance_km:5,group_kind:'running'}];
 await page.route('**/api/schedules/run/participation',route=>{if(phase==='error')return route.fulfill({status:503,json:{success:false}});return route.fulfill({json:{success:true,data:{participation:phase==='locked'?{participation_id:'p',status:'registered',pace_change_locked:true,participation_locked:true,pace_group_id:'g1'}:null,groupCounts:{g1:2,g2:phase==='full'?2:1},groupMembers:{g1:[{userId:'a',name:'김러너'},{userId:'b',name:'이달림'}],g2:[{userId:'c',name:'박크루'}]},participantCount:phase==='full'?3:2,totalParticipants:phase==='full'?4:3,schedule:{...schedule,attendance_opened_at:phase==='locked'?'2026-01-01':null},paceGroups}}});});
 for(const width of [320,390,1280]){
  phase='open';await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.getByText('현재 3명 / 정원 3명',{exact:true}).waitFor();await page.getByText('정원 집계 2명 · 운영진 제외',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'참가 신청',exact:true}).isEnabled(),true);
  phase='full';await page.clock.runFor(15010);await page.getByText('현재 4명 / 정원 3명',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'정원 마감',exact:true}).isDisabled(),true);
  phase='open';await page.clock.runFor(15010);await page.getByRole('button',{name:'참가 신청',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'참가 신청',exact:true}).isEnabled(),true);
  phase='locked';await page.clock.runFor(15010);await page.getByText('출석이 시작되어 그룹을 추가할 수 없습니다.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'그룹 추가',exact:true}).count(),0);assert.equal(await page.getByText('출석이 시작되어 신청한 그룹을 변경할 수 없습니다. 참가자 명단을 확인해주세요.',{exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'그룹 변경',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390)await page.screenshot({path:path.join(dir,'locked-390.png'),fullPage:true});
  phase='error';await page.clock.runFor(15010);await page.getByRole('status').filter({hasText:'최신 신청 정보를 불러오지 못했습니다.'}).waitFor();

 }
 assert.deepEqual(errors,[]);console.log('Participation browser: 320/390/1280px live total/capacity refresh, full/reopened states, attendance lock and stale-data feedback passed');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
