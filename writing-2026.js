/* Aufgabenanteile gehören zur gespeicherten Prüfung, nicht zur aktuellen Auswahl im Setup. */
const WRITING_2026_WEIGHTS = {'en-ea-2026-I':[30,30,40],'en-ea-2026-II':[20,40,40],'fr-ea-2026':[30,40,30]};
function writing2026Payload(d) {
  if (!WRITING_2026_WEIGHTS[d?.writing_format]) return {};
  const definitions=[['1','doTask1','task_1'],['2','doTask2','task_2'],['3.1','doTask31','task_3_1'],['3.2','doTask32','task_3_2']];
  return {writing_format:d.writing_format,selected_writing_tasks:definitions.filter(t=>document.getElementById(t[1])?.checked).map(t=>({id:t[0],text:(t[0]==='3.1'?(d.task_3_1_quote||'')+' ':t[0]==='3.2'?(d.task_3_2_situation||'')+' ':'')+(d[t[2]]||''),weight:d.task_weights[Number(t[0][0])-1]}))};
}
(function(){
 const original=window.renderExam;
 window.renderExam=function(d){
  const weights=WRITING_2026_WEIGHTS[d.writing_format];
  if(weights)d.task_weights=weights.slice();
  ['1','2','31','32'].forEach((id,i)=>{
   const el=document.getElementById('weightLabel'+id);if(!el)return;
   if(!el.dataset.original)el.dataset.original=el.textContent;
   el.textContent=weights?'Aufgabe '+(i<2?i+1:i===2?'3.1':'3.2')+' ('+weights[Math.min(i,2)]+'%)':el.dataset.original;
  });
  return original(d);
 };
 const originalSelected=window.getSelectedTasks;
 window.getSelectedTasks=function(){
  const base=originalSelected();
  const p=writing2026Payload(CONFIG.storedData);
  return p.selected_writing_tasks?base+'\n\nAufgabenanteile im Schreiben: '+p.selected_writing_tasks.map(t=>t.id+': '+t.weight+'%').join(', ')+'. Bei Teiltraining nur die gewählten Aufgaben anteilig bewerten.':base;
 };
 window.addEventListener('load',function(){
  const note=document.createElement('p');
  note.textContent='Training des Prüfungsteils Schreiben, keine vollständige Abiturprüfung. Die eA-Gewichte orientieren sich am Aufgabenheft 2026. Sprachmittlung und Hörverstehen sind separate Module.';
  document.getElementById('setupGenerate').prepend(note);
 });
})();
