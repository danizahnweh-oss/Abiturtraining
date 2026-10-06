import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionFields, validateRevision, handleTeacherRevision } from '../../src/handlers/teacher-revision.js';
import { generateTeacherToken } from '../../src/auth.js';
const task = { thema:'Genetik', gesamt_be:5, aufgabe:'Untersuchen Sie den Versuch.', teilaufgaben:[{id:'a',text:'Erklären Sie die Replikation.',be:5}], material:[{type:'text',text:'Originalquelle'}], materialien:[{typ:'bild',inhalt:'Bildprompt',image_url:'data:image/png;base64,AA'}], student_text:'Privat' };
const fields = revisionFields(task);
test('editable fields exclude material, images, student answers, IDs and points', () => {
  assert.deepEqual(fields.map(f => f.path), [['aufgabe'],['teilaufgaben',0,'text']]);
});
test('patch validation rejects protected fields, unknown paths and duplicates', () => {
  for(const path of [['gesamt_be'],['material',0,'text'],['__proto__','polluted']]) assert.throws(()=>validateRevision({edits:[{path,text:'new',reason:'klarer'}]},fields));
  const edit={path:['aufgabe'],text:'Analysieren Sie den Versuch.',reason:'Präziser Operator'};
  assert.throws(()=>validateRevision({edits:[edit,edit]},fields));
  assert.equal(validateRevision({edits:[edit]},fields)[0].before,task.aufgabe);
});
const env={TEACHER_AUTH_SECRET:'test-only',OPENAI_API_KEY:'test-only', DB:{prepare(sql){assert.match(sql,/FROM teachers/);return {bind(){return {async first(){return {id:'teacher'}}}}}}}};
const req=(body,token='')=>new Request('https://example.test/api/generate-teacher-revision',{method:'POST',headers:{'X-Teacher-Auth-Token':token},body:JSON.stringify(body)});
test('unauthenticated users cannot request a revision',async()=>{
  assert.equal((await handleTeacherRevision(req({task_data:task,instructions:'Klarer formulieren'}),env)).status,401);
});
test('valid teacher draft receives checked edits without writes or material changes',async()=>{
  const token=await generateTeacherToken(env,'teacher');
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,options)=>{
    assert.ok(!options.body.includes('data:image'));
    assert.ok(!options.body.includes('Privat'));
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(calls++===0?{edits:[{path:['teilaufgaben',0,'text'],text:'Erläutern Sie die semikonservative Replikation.',reason:'Präzisiert das Verfahren.'}]}:{valid:true})},finish_reason:'stop'}]}));
  };
  try {
    const response=await handleTeacherRevision(req({task_data:task,instructions:'Präzisiere den Operator.'},token),env);
    assert.equal(response.status,200);assert.equal(calls,2);
    assert.equal((await response.json()).edits[0].before,task.teilaufgaben[0].text);
    assert.equal(task.teilaufgaben[0].be,5);
  } finally {globalThis.fetch=original;}
});
test('failed semantic check blocks the proposal',async()=>{
  const token=await generateTeacherToken(env,'teacher');const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(calls++===0?{edits:[{path:['aufgabe'],text:'Beurteilen Sie das Experiment.',reason:'Operator'}]}:{valid:false})},finish_reason:'stop'}]}));
  try{assert.equal((await handleTeacherRevision(req({task_data:task,instructions:'Klarer formulieren'},token),env)).status,502);}finally{globalThis.fetch=original;}
});
