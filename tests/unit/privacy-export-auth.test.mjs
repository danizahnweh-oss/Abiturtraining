import test from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, generateTeacherToken, verifyTeacherAuthToken } from '../../src/auth.js';
import { handleExportOwnData } from '../../src/handlers/student.js';
function fixture() {
 const state={active:true,fail:false,malformed:false,queries:[]};
 const env={ACCESS_TOKEN_SECRET:'student-test',TEACHER_AUTH_SECRET:'teacher-test',DB:{prepare(sql){
  state.queries.push(sql);return {bind(){return this},async first(){
   if(sql.includes('FROM teachers'))return state.active?{id:'teacher'}:null;
   return {id:'1',name:'Synthetic',email_updates_consent_at:'2026-10-01',email_updates_consent_version:'1',hidden_subjects:'["mathe"]'};
  },async all(){if(state.fail)throw Error('internal database details');if(state.malformed)return {};return {results:sql.includes('FROM results')?[{feedback_html:'Synthetic feedback'}]:[]}}};
 }}};
 return {state,env};
}
test('previous teacher token immediately loses access after blocking or deletion',async()=>{
 const {state,env}=fixture(),token=await generateTeacherToken(env,'teacher');
 assert.equal(await verifyTeacherAuthToken(token,env),'teacher');state.active=false;
 assert.equal(await verifyTeacherAuthToken(token,env),null);
});
test('teacher lookup failure denies access',async()=>{
 const {env}=fixture(),token=await generateTeacherToken(env,'teacher');
 env.DB.prepare=()=>{throw Error('database down')};assert.equal(await verifyTeacherAuthToken(token,env),null);
});
test('export includes feedback and consent information without secrets',async()=>{
 const {env,state}=fixture();const token=await generateToken(env,undefined,{sid:'1',sub:'synthetic'});
 const res=await handleExportOwnData(new Request('https://example.test/api/export',{headers:{'X-Access-Token':token}}),env);
 assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'no-store');const body=await res.json();
 assert.equal(body.results[0].feedback_html,'Synthetic feedback');assert.equal(body.account.learning_email_consent_at,'2026-10-01');
 assert.deepEqual(body.account.hidden_subjects,['mathe']);assert.ok(state.queries.some(q=>q.includes('r.feedback_html')));
 assert.ok(!JSON.stringify(body).includes(token));assert.equal(body.account.hash,undefined);
});
for(const mode of ['fail','malformed'])test('export refuses misleading partial success on '+mode,async()=>{
 const {env,state}=fixture();state[mode]=true;const token=await generateToken(env,undefined,{sid:'1',sub:'synthetic'});
 const res=await handleExportOwnData(new Request('https://example.test/api/export',{headers:{'X-Access-Token':token}}),env);
 assert.equal(res.status,503);assert.equal(res.headers.get('Content-Disposition'),null);
 assert.doesNotMatch(await res.text(),/internal database details/);
});
