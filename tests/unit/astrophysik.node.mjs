import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAstroExam, handleGenerateAbiturAstrophysik, handleGradeAbiturAstrophysik } from '../../src/subjects/astrophysik.js';
const exam = () => ({ aufgaben: ['induktion','wellen','sterne','sternsysteme'].map((bereich,i)=>({id:String(i+1),bereich,titel:bereich,sachgebiet:bereich,material:[{id:'M1',type:'text',text:'Vollständige fiktive Versuchsdaten für die Prüfung.'}],teilaufgaben:Array.from({length:6},(_,j)=>({id:String(j),text:'Erklären Sie die Beobachtung.',be:5}))})) });
test('Eigenes gA-Format: vier Gruppen, drei gewählt, 90 BE',()=> {
 const result=validateAstroExam(exam()); assert.equal(result.gesamt_be,90); assert.equal(result.pruefungsdauer,255); assert.equal(result.auswahl,3);
});
test('Unvollständige Gruppen und Bildplatzhalter werden abgelehnt',()=>{
 for(const mutate of [d=>d.aufgaben.pop(),d=>d.aufgaben[0].teilaufgaben[0].be=29,d=>d.aufgaben[0].material[0].type='karikatur',d=>d.aufgaben[0].material=[]]) {
 const d=exam();mutate(d);assert.throws(()=>validateAstroExam(d)); }
});
test('eA und ungültige Auswahl erreichen keine KI',async()=>{
 const env={};const req=body=>({json:async()=>body});
 assert.equal((await handleGenerateAbiturAstrophysik(req({level:'eA'}),env)).status,400);
 assert.equal((await handleGradeAbiturAstrophysik(req({aufgaben:exam().aufgaben}),env)).status,400);
});
test('Fehlerhafte KI-Ausgabe wird einmal neu erstellt',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(++calls===1?{}:exam())},finish_reason:'stop'}]}));
 try {const response=await handleGenerateAbiturAstrophysik({json:async()=>({level:'gA'})},{OPENAI_API_KEY:'test-only'});
 assert.equal(response.status,200);assert.equal(calls,2);}finally{globalThis.fetch=old;}
});

test('Bewertung nutzt die gewählten Aufgaben und berechnet die Punktesumme',async()=>{
 const old=globalThis.fetch; const aufgaben=exam().aufgaben.slice(0,3);
 globalThis.fetch=async(url,options)=>{
   const request=JSON.parse(options.body);
   assert.match(JSON.stringify(request.messages),/Versuchsdaten/);
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({aufgaben_be:aufgaben.map(a=>({id:a.id,erreichte_be:20,max_be:30})),gesamt_be:90,max_be:90,feedback:'Prüfrückmeldung'})},finish_reason:'stop'}]}));
 };
 try {const result=await handleGradeAbiturAstrophysik({json:async()=>({aufgaben,student_text:'Meine ausführliche Lösung',level:'gA'})},{OPENAI_API_KEY:'test-only'});
 assert.equal(result.status,200);assert.equal((await result.json()).gesamt_be,60);}finally{globalThis.fetch=old;}
});
