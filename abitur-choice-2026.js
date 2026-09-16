/* Neue eA-Auswahlprüfungen; alte A/B-Entwürfe bleiben unverändert. */
(function () {
  const format = 'choice-ea-2026-v1';
  const byId = id => document.getElementById(id);
  window.choice2026Payload = function (d) {
    return d?.exam_format === format ? {exam_format:format,selected_task:d.choices.find(t=>t.id===d.selected_choice),laengsschnittthema:d.laengsschnittthema,material_images:collectExamMaterialImages()} : {};
  };
  const legacyRender = window.renderTask;
  const originalNav = window.nav;
  let displayedData = null;
  function remember() {
    const d=CONFIG.storedData;
    if(d?.exam_format===format && d.selected_choice) {
      d.choice_drafts=d.choice_drafts||{};
      d.choice_drafts[d.selected_choice]=byId('studentTextA').value;
    }
  }
  byId('studentTextA').addEventListener('input',remember);
  function visibility(d) {
    const active=d?.exam_format===format;
    byId('choice2026Picker').hidden=!active;
    byId('taskInstructionB').closest('.card').hidden=active;
    byId('studentTextB').closest('.write-part').hidden=active;
    byId('writeTaskRefB').hidden=active;
    byId('writeTaskRefB').previousElementSibling.hidden=active;
    byId('writeTaskRefB').previousElementSibling.previousElementSibling.hidden=active;
    ['scoreTeilA','scoreTeilB','scoreDarstellung'].forEach(id=>byId(id).closest('.score-card').hidden=active);
    byId('studentTextA').closest('.write-part').querySelector('h3').textContent=active?'Deine Lösung zur gewählten Aufgabe':'Prüfungsteil A';
    byId('studentTextA').setAttribute('aria-label',active?'Deine Lösung zur gewählten Aufgabe':'Deine Antwort zu Teil A');
    byId('studentTextA').placeholder=active?'Bearbeite hier alle Teilaufgaben der gewählten Aufgabe.':'Beginne hier mit Prüfungsteil A.';
    document.querySelectorAll('[onclick="useOCRTextB()"], #korrekturBodyB').forEach(el=>{ if(el.id==='korrekturBodyB')el.closest('.korrektur-teil').hidden=active;else el.hidden=active; });
    const ocrA=document.querySelector('[onclick="useOCRTextA()"]');
    if(ocrA)ocrA.textContent=active?'In meine Lösung übernehmen':'In Teil A übernehmen';
    byId('writeTaskRefA').previousElementSibling.textContent=active?'Gewählte Aufgabe':'Prüfungsteil A';
    const heading=byId('teilABadge').parentElement;
    heading.firstChild.textContent=active?'Gewählte Aufgabe ':'Prüfungsteil A ';
    byId('teilABadge').textContent=active?'120 BE':((sessionStorage.getItem('student_level')||'eA').toLowerCase()==='ea'?'85 BE':'75 BE');
  }
  const picker=document.createElement('div');
  picker.id='choice2026Picker';picker.className='card';picker.hidden=true;
  picker.innerHTML='<h2>Eine von vier Aufgaben auswählen</h2><p>Jede Aufgabe: 120 BE. Bearbeitungszeit: 270 Minuten. Du bearbeitest genau eine vollständige Aufgabe. Kürzere Zeiten sind individuelles Training.</p><label for="choice2026Select">Aufgabe zur Ansicht und Bearbeitung</label><select id="choice2026Select" style="min-height:44px;font-size:16px;width:100%"></select><p id="choice2026Status" role="status"></p>';
  byId('sec-task').prepend(picker);
  byId('choice2026Select').addEventListener('change',function(){
    const d=CONFIG.storedData;
    if(byId('submitBtn').disabled || (typeof gymRestoringTask!=='undefined' && gymRestoringTask===d)){this.value=d.selected_choice||'';showToast('Bitte warte, bis die laufende Bewertung abgeschlossen ist.');return;}
    remember();
    d.choice_recovery=d.choice_recovery||{};
    if(d.selected_choice && d._gymRecoveryId)d.choice_recovery[d.selected_choice]=d._gymRecoveryId;
    d.selected_choice=this.value;
    d._gymRecoveryId=d.choice_recovery[this.value]||crypto.randomUUID();
    d.choice_recovery[this.value]=d._gymRecoveryId;
    if(typeof gymLastCompleted!=='undefined')gymLastCompleted=null;
    byId('studentTextA').value=d.choice_drafts?.[this.value]||'';
    byId('studentTextB').value='';
    // Rückmeldungen beziehen sich auf die vorherige Auswahl und dürfen nicht weiter angezeigt werden.
    byId('feedbackBody').innerHTML='';byId('modelAnswerBody').innerHTML='';
    byId('modelAnswerCard').style.display='none';
    ['scoreTeilA','scoreTeilB','scoreDarstellung','scoreTotal'].forEach(id=>byId(id).textContent='–');
    ['korrekturCard','aspekteCard'].forEach(id=>{if(byId(id))byId(id).style.display='none';});
    window.renderTask(d);saveSession();updateWordCounts();
  });
  window.renderTask=function(d){
    if(d.exam_format!==format){legacyRender(d);visibility(d);displayedData=d;return;}
    const selected=d.choices.find(t=>t.id===d.selected_choice);
    d.task_instruction_a=selected?selected.teilaufgaben.map(t=>t.id+'. '+t.text+' ('+t.be+' BE)').join('\n\n'):'Bitte zuerst eine der vier Aufgaben auswählen.';
    d.task_instruction_b='';d.materials=selected?selected.materials:[];
    if(displayedData!==d){byId('studentTextA').value=d.choice_drafts?.[d.selected_choice]||'';byId('studentTextB').value='';}
    displayedData=d;
    legacyRender(d);
    byId('choice2026Select').innerHTML='<option value="">Bitte auswählen</option>'+d.choices.map(t=>'<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.id+' · '+t.title)+'</option>').join('');
    byId('choice2026Select').value=d.selected_choice||'';
    byId('choice2026Status').textContent=selected?'Ausgewählt: '+selected.title:'Noch keine Aufgabe ausgewählt.';
    visibility(d);
  };
  window.nav=function(step,push){
    if((step==='write'||step==='feedback')&&CONFIG.storedData?.exam_format===format&&!CONFIG.storedData.selected_choice){showToast('Bitte zuerst eine der vier Aufgaben auswählen.');return;}
    return originalNav(step,push);
  };
  const originalSave=window.saveSession;
  window.saveSession=function(){remember();return originalSave();};
  window.addEventListener('load',function(){
    const ea=(sessionStorage.getItem('student_level')||'eA').toLowerCase()==='ea';
    const note=document.createElement('p');
    note.textContent=ea?'eA-Auswahlprüfung 2026: eine von vier Aufgaben, 120 BE, 270 Minuten. Die Themenwahl ist eine Präferenz, keine Beschränkung der gesamten Prüfung.':'gA-Thementraining. Die vollständige Übereinstimmung mit dem gA-Abitur 2026 ist noch nicht verifiziert.';
    byId('setupGenerate').prepend(note);
    if(ea)byId('setupLoader').querySelector('.loader-text').textContent='Vier vollständige Aufgaben werden erstellt …';
    if(ea)byId('setupGenerate').querySelector('label').textContent='Themenpräferenz für eine der vier Aufgaben';
  });
})();
