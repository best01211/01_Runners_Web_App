// Static layout fixtures from real components. No authentication or database calls.
// Run with node scripts/preview-responsive.mjs; stop with Ctrl+C.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root=process.cwd();
let previewPath="/dashboard";
const cache=new Map();
function load(name){
 let filename=path.resolve(root,name);if(!path.extname(filename))filename=['.tsx','.ts'].map(ext=>filename+ext).find(file=>fs.existsSync(file));
 if(cache.has(filename))return cache.get(filename).exports;
 const mod=new Module(filename);cache.set(filename,mod);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 const baseRequire=mod.require.bind(mod);
 mod.require=id=>{
  if(id==='next/navigation')return {useRouter:()=>({refresh(){},push(){}}),usePathname:()=>previewPath};
  if(id.startsWith('@/'))return load('src/'+id.slice(2));
  if(id.startsWith('.')&&!path.extname(id))return load(path.resolve(path.dirname(filename),id));
  return baseRequire(id);
 };
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,filename);
 return mod.exports;
}
const h=React.createElement;
const component=(name,props)=>{const [file,exported]=name.split('#');return h(load('src/components/'+file)[exported],props)};
const card=(title,children)=>h('section',{className:'mb-8 min-w-0'},h('h2',{className:'mb-4 text-xl font-bold'},title),children);
const screens={
 tracking:[h('header',{className:'page-heading'},h('div',null,h('h1',null,'라이브 추적'),h('p',{className:'page-description'},'가상 데이터로 확인하는 관리자 화면입니다.'))),h('article',{className:'tracking-race-card rounded-2xl border'},h('h2',null,'2001 Runners 테스트 대회'),h('p',{className:'mt-2 text-sm text-zinc-500'},'2026. 10. 18. 오전 9:00 · 10km · 테스트 장소'),h('p',{className:'text-link mt-3'},'라이브 추적 보기'),h('div',{className:'mt-4 border-t border-zinc-100 pt-4'},component('race-tracking/delete-race-button#DeleteRaceButton',{raceId:'11111111-1111-4111-8111-111111111111',name:'2001 Runners 테스트 대회'})))],
 admin:[card('회원 관리',h('article',{className:'grid min-w-0 gap-4 rounded-2xl border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'},h('div',{className:'min-w-0 [overflow-wrap:anywhere]'},h('b',null,'테스트 회원'),h('p',{className:'text-sm text-zinc-500'},'verylongmemberidentifierwithoutspaces12345678901234567890@example.com')),component('admin/member-actions#MemberActions',{userId:'test',role:'staff',position:'president',status:'active',excluded:false,actorIsAdmin:true}))),card('시즌 관리',component('admin/season-manager#SeasonManager',{seasons:[{season_id:'test',name:'2026 가을 정기 활동 시즌 테스트 긴 이름',starts_on:'2026-10-01',ends_on:'2026-12-31',status:'active',is_public:true,is_default:true}]})),card('서비스 설정',component('admin/service-settings#ServiceSettings',{initial:{status:'restricted',blocked:{access:true},message:'모바일 화면 점검용 가상 데이터'}}))],
 schedule:[card('일정 생성',component('schedules/schedule-form#ScheduleForm',{canManageTypes:true,templates:[]})),component('participation/participation-panel#ParticipationPanel',{scheduleId:'test',scheduleType:'regular',scheduleStatus:'open',participantCount:60,capacity:60,registrationStartAt:null,registrationEndAt:'2099-01-01',cancellationDeadlineAt:null,participation:null,canParticipate:true,canChangeGroup:true,canCreatePaceGroup:true,paceGroups:[{pace_group_id:'test',pace_seconds:360,distance_km:5}]}),card('페이스 그룹',component('schedules/pace-group-editor#PaceGroupEditor',{groups:[{paceSeconds:360,distanceKm:5}],onChange(){}}))],
 profile:[card('내 정보',component('profile/profile-form#ProfileForm',{initial:{name:'테스트회원',email:'test@example.com',phone:'010-0000-0000',nickname:'테스트 회원',profile_image_url:null}})),component('profile/password-form#PasswordForm',{})],
 popup:[component('service/maintenance-popup#MaintenancePopup',{children:h('button',{'data-maintenance-blocked':true},'참가 신청')})],
};
screens["participation-joined"]=[card("러닝 참가",h(screens.schedule[1].type,{...screens.schedule[1].props,canCreatePaceGroup:false,participation:{participation_id:"preview-joined",status:"registered",participation_locked:false,pace_change_locked:false,pace_group_id:"test"}}))];
const demoProfile={user_id:'preview-member',login_id:'preview_runner',name:'테스트러너',nickname:'테스트러너',role:'member',account_status:'active',approval_status:'approved',staff_position:null,profile_image_url:null};
const demoNow='2026-10-15T00:00:00Z';
const demoSchedules=[{schedule_id:'preview-run-1',title:'함께 달리는 한강 정기런',schedule_type:'regular',status:'open',location:'반포한강공원',start_at:'2026-10-17T08:00:00Z',registration_end_at:'2026-10-17T07:00:00Z',capacity:30},{schedule_id:'preview-run-2',title:'가볍게 시작하는 주말 아침 러닝',schedule_type:'flash',status:'open',location:'올림픽공원',start_at:'2026-10-18T00:00:00Z',registration_end_at:'2026-10-17T14:00:00Z',capacity:10}];
screens.dashboard=[component('dashboard/dashboard-view#DashboardView',{profile:demoProfile,schedules:demoSchedules,now:demoNow,activity:{seasonName:"2026 가을 시즌",rank:3,score:120,attended:10,late:1,absent:1,total:12,attendanceRate:92}})];
screens['dashboard-empty']=[component('dashboard/dashboard-view#DashboardView',{profile:demoProfile,schedules:[],now:demoNow})];
screens['dashboard-error']=[component('dashboard/dashboard-view#DashboardView',{profile:{...demoProfile,account_status:'restricted'},schedules:[],now:demoNow,scheduleError:true,activityError:true})];
screens['dashboard-long']=[component('dashboard/dashboard-view#DashboardView',{profile:{...demoProfile,name:'매우긴이름을사용하는테스트회원',nickname:null,role:'admin'},schedules:[{...demoSchedules[0],title:'함께 달리는 2001 Runners 주말 한강 장거리 정기 러닝 일정 안내',location:'반포한강공원 달빛광장 안내소 앞 집결 장소를 확인해 주세요.'}],now:demoNow})];
screens.schedules=[h('header',{className:'page-heading'},h('div',null,h('p',{className:'eyebrow'},'FIND YOUR NEXT RUN'),h('h1',null,'러닝 일정'),h('p',{className:'page-description'},'함께 달릴 다음 순간을 찾아보세요.'))),...demoSchedules.map(schedule=>component('schedules/schedule-card#ScheduleCard',{schedule,now:demoNow}))];
screens.ranking=[component('ranking/ranking-view#RankingView',{currentUserId:'preview-member',data:{ranking:Array.from({length:36},(_,i)=>({userId:i===23?'preview-member':`preview-${i}`,realName:i===23?'홍길동':`이회원${i+1}`,nickname:i%3===0?null:`달리는러너${i+1}`,name:i===23?'테스트러너 < 홍길동':i%3===0?`김러너${i+1}`:`달리는러너${i+1} < 이회원${i+1}`,attended:36-i,late:0,absent:2,total:38-i,score:360-i*10,attendanceRate:Math.round((36-i)/(38-i)*100)})),season:{season_id:'preview-season',name:'2026 가을 시즌',starts_on:'2026-10-01',ends_on:'2026-12-31'},seasons:[{season_id:'preview-season',name:'2026 가을 시즌',starts_on:'2026-10-01',ends_on:'2026-12-31',status:'active',is_default:false,is_public:true}],currentSeasonId:'preview-season',policy:{attended:10,late:7,absent:0,pacer:3,minimumAttendance:3,includeGuests:false}}})];
const css=(await postcss([tailwind()]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')})).css+'\n'+fs.readFileSync('src/app/polish.css','utf8');
function html(screen){
 previewPath=screen==='tracking'?'/tracking':screen.startsWith('dashboard')?'/dashboard':screen==='schedules'||screen==='schedule'?'/schedules':screen==='ranking'?'/leaderboard':screen==='admin'?'/admin':'/profile';
 const standalone=screen.startsWith('dashboard')||screen==='ranking';
 const inner=standalone?screens[screen][0]:h('main',{className:'mx-auto w-full max-w-4xl px-6 py-8'},...(screens[screen]??[]));
 let content=renderToStaticMarkup(component('navigation/app-shell#AppShell',{children:inner}));
 if(screen==='popup')content=content.replace('<dialog ','<dialog open ');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>2001 Runners 디자인 미리보기 · 가상 데이터</title><link rel="stylesheet" href="/styles.css"><style>:root{--font-geist-sans:Arial}</style></head><body>'+content+'</body></html>';
}
http.createServer((req,res)=>{if(req.url==="/branding/01runners-logo.png"){res.setHeader("Content-Type","image/png");res.end(fs.readFileSync("public/branding/01runners-logo.png"));return;}if(req.url==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}const key=(req.url??'/').slice(1);res.setHeader('Content-Type','text/html; charset=utf-8');res.end(screens[key]?html(key):'<h1>반응형 점검</h1>'+Object.keys(screens).map(k=>'<p><a href="/'+k+'">'+k+'</a></p>').join(''));}).listen(3101,'127.0.0.1',()=>console.log('Responsive preview ready: http://localhost:3101 (static fixtures only)'));
