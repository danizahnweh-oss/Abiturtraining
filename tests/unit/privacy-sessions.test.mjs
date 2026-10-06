import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../hetzner-backend/gemini-proxy/server.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace('export default app;', '');
function fixture() {
 const routes = new Map(), sessions = new Map(), events = new Map();
 const state={active:true,upgraded:false};
 const app={use(){},options(){},all(){},get(path,fn){routes.set('GET '+path,fn)},post(path,fn){routes.set('POST '+path,fn)}};
 const express=Object.assign(()=>app,{json:()=>()=>{}});
 const scope={express,crypto,Buffer,URL,console,
   process:{env:{ACCESS_TOKEN_SECRET:'new-test-key',ACCESS_PASSWORD:'old-test-key'},on(){}},
   dotenv:{config(){}},
   createServer:()=>({on(name,fn){events.set(name,fn)},listen(){}}),
   Redis:class {async get(key){return sessions.get(key)} async set(key,value){sessions.set(key,value)}},
   pg:{Pool:class {async query(sql,params){
    if(sql.includes('name_lower'))return {rows:state.active&&['1','2'].includes(params[0])&&params[1]==='student-'+params[0]?[{id:params[0]}]:[]};
    return {rows:[{id:params[0],subscription_status:'active',subscription_plan:'premium',current_period_end:'2099-01-01'}]};
   }}},
   WebSocketServer:class {handleUpgrade(){state.upgraded=true}},WebSocket:{},
 };
 vm.runInNewContext(source,scope);
 return {routes,sessions,events,state};
}
function token(id){const data=JSON.stringify({iat:Date.now(),sid:id,sub:'student-'+id});return Buffer.from(data).toString('base64')+'.'+crypto.createHmac('sha256','new-test-key').update(data).digest('hex')}
function request(id,extra={}){return {headers:{'x-access-token':token(id),origin:'https://myabiflow.de',host:'example.test'},params:{id:'session-a'},...extra}}
function response(){return {code:200,headers:{},set(h){this.headers=h;return this},status(c){this.code=c;return this},json(body){this.body=body;return this}}}
for(const endpoint of ['status','transcript'])test('session '+endpoint+' requires active owner and refuses other or deleted accounts',async()=>{
 const f=fixture();f.sessions.set('session:session-a',JSON.stringify({ownerStudentId:'1',transcript:['private transcript']}));
 const route=f.routes.get('GET /session/:id/'+endpoint);
 const own=response();await route(request(1),own);assert.equal(own.code,200);assert.equal(own.headers['Cache-Control'],'no-store');
 const other=response();await route(request(2),other);assert.equal(other.code,404);assert.ok(!JSON.stringify(other.body).includes('private transcript'));
 f.state.active=false;const removed=response();await route(request(1),removed);assert.equal(removed.code,401);
 const anon=response();await route({headers:{},params:{id:'session-a'}},anon);assert.equal(anon.code,401);
});
test('session creation replaces a forged student ID with signed identity',async()=>{
 const f=fixture(),res=response();await f.routes.get('POST /session/create')(request(1,{body:{student_id:'2',subject:'mathe'}}),res);
 assert.equal(res.code,200);const session=JSON.parse(f.sessions.get('session:'+res.body.sessionId));
 assert.equal(session.ownerStudentId,'1');assert.equal(session.studentId,'1');assert.equal(session.config.student_id,'1');
});
test('legacy session without verified ownership is not exposed',async()=>{
 const f=fixture(),res=response();f.sessions.set('session:session-a',JSON.stringify({studentId:'1',transcript:['private']}));
 await f.routes.get('GET /session/:id/transcript')(request(1),res);assert.equal(res.code,404);
});
test('websocket upgrade refuses sessions belonging to another account',async()=>{
 const f=fixture();f.sessions.set('session:session-a',JSON.stringify({ownerStudentId:'1',studentId:'1',config:{subject:'mathe'}}));
 let destroyed=false;await f.events.get('upgrade')(request(2,{url:'/session/session-a/ws'}),{destroy(){destroyed=true}},Buffer.alloc(0));
 assert.equal(destroyed,true);assert.equal(f.state.upgraded,false);
});
