import test from 'node:test';
import assert from 'node:assert/strict';
import '../../teacher-material-editor.js';
const { collect, apply } = globalThis.TeacherMaterialEditor;

test('all collections and nested exam alternatives are editable together', () => {
 const task={article_text:'Article',source_text_de:'Quelle',latin_text:'Latein',materials:[{type:'text',content:'First'}],materialien:[{typ:'quelle',inhalt:'Second'}],material:[{type:'statistik',text:'Table'}],zusatz_materialien:[{content:'Extra'}],materialien_1:[{inhalt:'Part one'}],choices:[{id:'I',materials:[{title:'Nested',content:'Nested text'}]}]};
 const fields=collect(task);
 assert.equal(fields.length,9);
 for(const [i,field] of fields.entries())apply(task,field,'Edited '+i);
 assert.equal(task.choices[0].materials[0].content,'Edited 8');
 assert.equal(task.materials[0].content,'Edited 3');
});
test('empty fields use exact storage key and duplicate aliases stay aligned', () => {
 const task={materials:[{inhalt:'',content:'Actual text',text:'Actual text'}],primary_text:''};
 const fields=collect(task);apply(task,fields[0],'Changed');
 assert.deepEqual(task.materials[0],{inhalt:'',content:'Changed',text:'Changed'});
 apply(task,fields[1],'New source');assert.equal(task.primary_text,'New source');
 apply(task,fields[0],'');assert.equal(task.materials[0].content,'');
});
test('images, private fields and solutions are never treated as source texts', () => {
 assert.deepEqual(collect({materials:[{type:'image',content:'Prompt'},{type:'text',content:'data:image/png;base64,AA'}],primary_type:'foto',primary_text:'Photo prompt',student_text:'Private',_source:{article_text:'Hidden'},solution:{article_text:'Answer'}}),[]);
});
test('edits preserve metadata and original input is unchanged until applied',()=>{
 const task={materials:[{id:'M1',type:'text',content:'Original',source:'Archive'}],gesamt_be:20};
 const fields=collect(task);assert.equal(task.materials[0].content,'Original');apply(task,fields[0],'Revised');
 assert.equal(task.materials[0].source,'Archive');assert.equal(task.gesamt_be,20);
 assert.throws(()=>apply(task,{path:['__proto__','text'],aliases:[]},'bad'));
});
