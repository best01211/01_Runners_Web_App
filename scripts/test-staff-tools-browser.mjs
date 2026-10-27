import {build} from '../.test-output/map-qa/node_modules/esbuild/lib/main.js';
import {chromium} from '../.test-output/map-qa/node_modules/@playwright/test/index.mjs';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';import assert from 'node:assert/strict';import postcss from 'postcss';import tailwind from '@tailwindcss/postcss';
const dir=path.resolve('.test-output/staff-tools');mkdirSync(dir,{recursive:true});
writeFileSync(path.join(dir,'fixture.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{AttendancePanel}from'../../src/components/attendance/attendance-panel';import{PaceGroupManagement}from'../../src/components/participation/pace-group-management';import{MemberDirectory}from'../../src/components/admin/member-directory';
const groups=[{pace_group_id:'g1',pace_seconds:330,distance_km:5,group_kind:'running'},{pace_group_id:'g2',pace_seconds:360,distance_km:5,group_kind:'running'},{pace_group_id:'storage',pace_seconds:0,distance_km:0,group_kind:'storage'}];
const rows=[{user_id:'a',status:'not_checked',pace_group_id:'g1',profiles:{name:'김러너'}},{user_id:'b',status:'attended',pace_group_id:'g1',profiles:{name:'이달림'}},{user_id:'c',status:'late',pace_group_id:'g2',profiles:{name:'박크루'}}];
const state=new URLSearchParams(location.search).get('state');
createRoot(document.getElementById('root')).render(<div className="app-shell"><div className="main-body"><main style={{padding:16}}>{state==='directory'?<MemberDirectory members={rows.map((r,i)=>({user_id:r.user_id,name:r.profiles.name,nickname:['번개','바람','햇살'][i],role:'member',staff_position:null,account_status:'active',login_id:r.user_id,ranking_excluded:false,is_pacer:false}))} canEdit={false} isAdmin={false} selfId="a"/>:state==='groups'||state==='locked'?<PaceGroupManagement scheduleId="schedule" groups={groups} members={rows.map(r=>({userId:r.user_id,name:r.profiles.name,groupId:r.pace_group_id,isStaff:false}))} locked={state==='locked'}/>:<AttendancePanel scheduleId="schedule" startAt="2020-01-01T00:00:00Z" canManage={true} paceGroups={groups} initialData={{attendance:rows,attendanceOpen:true,attendanceClosed:false,attendanceCode:'1234'}}/>}</main></div></div>);`);
await build({entryPoints:[path.join(dir,'fixture.tsx')],outfile:path.join(dir,'bundle.js'),bundle:true,format:'esm',jsx:'automatic',plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',resolveDir:process.cwd(),contents:a.path==='next/navigation'?`export function useRouter(){return{refresh(){window.__refresh=(window.__refresh||0)+1},push(){}}}`:`import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`}));}}]});
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});writeFileSync(path.join(dir,'styles.css'),css.css+'\n'+readFileSync('src/app/polish.css','utf8'));
const server=createServer((req,res)=>{const f=new URL(req.url,'http://test').pathname.slice(1);if(['bundle.js','styles.css'].includes(f)){res.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(path.join(dir,f)));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script type="module" src="/bundle.js"></script>')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)});
 const page=await browser.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const freshRows=[{user_id:'a',status:'not_checked',pace_group_id:'g1',profiles:{name:'김러너'}},{user_id:'b',status:'attended',pace_group_id:'g1',profiles:{name:'이달림'}},{user_id:'c',status:'not_checked',pace_group_id:'g2',profiles:{name:'새참가자'}}];
 await page.route('**/api/schedules/schedule/attendance',async route=>{if(route.request().method()!=='GET')writes.push(route.request().postDataJSON());await route.fulfill({json:{success:true,data:{attendance:freshRows,attendanceOpen:true,attendanceClosed:false,attendanceCode:'1234'}}});});
 await page.route('**/api/schedules/schedule/pace-groups',async route=>{writes.push(route.request().postDataJSON());await route.fulfill({json:{success:true,data:{}}});});
 const visit=async state=>{await page.goto('http://127.0.0.1:'+server.address().port+'/?state='+state);};
 for(const width of [320,390,1280]) {
  await page.setViewportSize({width,height:900});await visit('attendance');
  await page.getByRole('button',{name:'미확인 1명',exact:true}).click();
  await page.getByRole('searchbox',{name:'참가자 이름 검색'}).fill('김');
  assert.equal(await page.locator('.roster-row').count(),1);
  await page.getByRole('searchbox',{name:'참가자 이름 검색'}).fill('없는사람');await page.getByText('검색 조건에 맞는 참가자가 없습니다.').waitFor();
  await page.getByRole('button',{name:'출석 종료',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByText('새참가자 · 6:00 / 5km').waitFor();assert.equal(await dialog.locator('li').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390)await page.screenshot({path:path.join(dir,'attendance-close-390.png'),fullPage:true});
  await dialog.getByRole('button',{name:'계속 확인'}).click();assert.equal(writes.length,0);
  await page.getByRole('button',{name:'출석 종료',exact:true}).click();await dialog.getByRole('button',{name:'출석 종료 확정'}).click();await page.getByRole('status').filter({hasText:'처리되었습니다.'}).waitFor();assert.equal(writes.pop().action,'close');
  await visit('directory');await page.getByRole('searchbox',{name:'회원 이름·닉네임 검색'}).fill('바람');assert.equal(await page.locator('.member-list-item').count(),1);await page.getByText('이달림',{exact:true}).waitFor();
  await page.getByRole('searchbox').fill('없는사람');await page.getByText('검색된 회원이 없습니다.').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await visit('groups');await page.locator('summary').click();
  await page.getByRole('textbox',{name:'참가자 이름 검색'}).fill('김');await page.getByLabel('이동할 참가자').selectOption('a');
  assert.equal(await page.getByLabel('변경할 그룹').locator('option[value="storage"]').count(),0);
  await page.getByLabel('변경할 그룹').selectOption('g2');await page.getByRole('button',{name:'참가자 이동',exact:true}).click();await page.getByRole('status').filter({hasText:'참가자 그룹을 이동했습니다.'}).waitFor();assert.deepEqual(writes.pop(),{action:'move',userId:'a',groupId:'g2'});
  const first=page.locator('.staff-group-management form').first();await first.getByRole('spinbutton',{name:'거리 km',exact:true}).fill('6');await first.getByRole('button',{name:'그룹 수정'}).click();await page.getByRole('status').filter({hasText:'그룹을 수정했습니다.'}).waitFor();assert.equal(writes.pop().distanceKm,6);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===390)await page.screenshot({path:path.join(dir,'groups-390.png'),fullPage:true});
  await visit('locked');await page.locator('summary').click();assert.equal(await page.locator('.staff-group-management fieldset button:enabled').count(),0);assert.equal(await page.locator('.staff-group-management input:enabled').count(),0);
 }
 assert.deepEqual(errors,[]);console.log('Staff browser: 320/390/1280px, attendance search/filter/counts, fresh unfiltered close preview and confirm, name/nickname search, group edit/move and locked controls passed.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
