import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateChoiceExam,validateChoiceGrade,CHOICE_FORMAT,generateChoiceExam} from '../../src/subjects/choice-exam.js';
import {scoreWriting2026,validateWritingSelection} from '../../src/subjects/writing-2026.js';
import {validateGymnasiumGrade} from '../../src/subjects/gymnasium-points.js';
import {validatePuGMaterials} from '../../src/subjects/pug.js';
test('PuG: Material muss im richtigen Teil verwendet werden',()=>{
 const data={task_instruction_a:'Analysieren Sie A1.',task_instruction_b:'Analysieren Sie B1.',materials:[{id:'A1',part:'A',type:'text',content:'Text'},{id:'B1',part:'B',type:'bild',content:'Flyer'}]};
 assert.equal(validatePuGMaterials(data,true),data);
 data.materials[1].part='A';assert.throws(()=>validatePuGMaterials(data,true));
 data.materials.pop();assert.throws(()=>validatePuGMaterials(data,true));
});
export const choice=()=>({id:'I',title:'Verantwortung',teilaufgaben:Array.from({length:6},(_,i)=>({id:String(i+1),text:'Beurteilen Sie die Position in M1.',be:20})),materials:[{title:'M1',type:'text',content:'Ein vollständiger fiktiver Übungstext.'}]});
test('Auswahlprüfung: vier Alternativen mit je 120 BE, ungültige Summen blockiert',()=>{
 const data={choices:['I','II','III','IV'].map(id=>({...choice(),id}))};
 assert.equal(validateChoiceExam(data).gesamt_be,120);
 data.choices[0].teilaufgaben[0].be=19;assert.throws(()=>validateChoiceExam(data));
});
test('Auswahlprüfung: jede Teilbewertung gehört exakt zur gewählten Aufgabe',()=>{
 const input={exam_format:CHOICE_FORMAT,selected_task:choice()};
 const result={teilbewertungen:choice().teilaufgaben.map(t=>({id:t.id,max_be:20,erreichte_be:10}))};
 assert.equal(validateGymnasiumGrade('grade-abitur-ethik',input,result).gesamt_be,60);
 assert.equal(validateChoiceGrade(input,result).scores.total,6);
 result.teilbewertungen[0].id='FREMD';assert.throws(()=>validateChoiceGrade(input,result));
});
test('Religion verlangt das tatsächliche Kursthema vor der Generierung',async()=>{
 assert.equal((await generateChoiceExam({}, {},'religion')).status,400);
});
for(const [format,weights]of [['en-ea-2026-I',[30,30,40]],['en-ea-2026-II',[20,40,40]],['fr-ea-2026',[30,40,30]]]){
 test(format+': gewichtete Inhaltsnote, keine doppelte Wahlaufgabe',()=>{
 const body={writing_format:format,selected_writing_tasks:['1','2','3.1'].map((id,i)=>({id,text:'Aufgabe',weight:weights[i]}))};
 const result=scoreWriting2026(body,{task_scores:[{id:'1',content_np:15},{id:'2',content_np:5},{id:'3.1',content_np:10}],sprache_np:10});
 assert.equal(result.scores.content_textstructure,Math.round((15*weights[0]+5*weights[1]+10*weights[2])/100));
 body.selected_writing_tasks.push({id:'3.2',text:'Aufgabe',weight:weights[2]});assert.throws(()=>validateWritingSelection(body));
 });
}
test('Mathematik erlaubt innermathematische Aufgaben; Deutsch bietet verbindliche Vergleiche',()=>{
 const math=readFileSync(new URL('../../src/subjects/mathe.js',import.meta.url),'utf8');
 const abitur=math.slice(math.indexOf('export async function handleGenerateAbiturMathe'));
 assert.doesNotMatch(abitur,/ALLE Teilaufgaben müssen im Sachkontext/);
 assert.match(abitur,/innermathematische Aufgaben mit Sachkontexten/);
 const deutsch=readFileSync(new URL('../../src/subjects/deutsch.js',import.meta.url),'utf8');
 assert.match(deutsch,/Verbindlicher Werkvergleich/);
});
