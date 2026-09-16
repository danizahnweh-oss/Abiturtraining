import {test,expect} from '@playwright/test';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const exam={exam_format:'choice-ea-2026-v1',choices:['I','II','III','IV'].map(id=>({id,title:'Thema '+id,teilaufgaben:Array.from({length:6},(_,i)=>({id:String(i+1),text:'Erläutern Sie die Aussage von M1.',be:20})),materials:[{type:'text',title:'M1',content:'Fiktiver Übungstext mit vollständigen Aussagen.'}]}))};
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{for(const[k,v]of Object.entries({access:'1',free_access:'1',student_name:'Formatprüfung',student_id:'format-test',access_token:'test-token',student_level:'eA'}))sessionStorage.setItem(k,v);});
 await page.route('**/api/**',route=>route.fulfill({json:{status:'active',plan:'monthly'}}));
 await page.route('**/api/generate-image',route=>route.fulfill({json:{url:pixel}}));
});
for(const subject of ['ethik','religion']){
 test(subject+': Auswahl, Entwürfe, Neuladen, Bewertung und Legacy',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let sent:any;
  await page.route('**/api/generate-abitur-'+subject,route=>route.fulfill({json:exam}));
  await page.route('**/api/grade-submit',route=>{sent=route.request().postDataJSON();return route.fulfill({json:{job_id:'choice-job'}});});
  await page.route('**/api/grade-status/choice-job',route=>route.fulfill({json:{status:'completed',result:{scores:{total:10},feedback:'Gewählte Aufgabe bewertet: 80 / 120 BE.'}}}));
  await page.goto('/'+subject+'-abitur.html');
  if(subject==='religion')await page.locator('#laengsschnittthema').fill('Menschenwürde');
  await page.locator('#generateBtn').click();
  await expect(page.locator('#choice2026Select option')).toHaveCount(5);
  await page.evaluate(()=>(window as any).nav('write'));
  await expect(page.locator('#studentTextA')).not.toBeVisible();
  await page.locator('#choice2026Select').selectOption('I');
  await page.evaluate(()=>(window as any).nav('write'));
  await page.locator('#studentTextA').fill('Antwort zu I. '+ 'Eine sachlich begründete Antwort. '.repeat(30));
  await expect(page.locator('#studentTextB')).not.toBeVisible();
  await page.evaluate(()=>(window as any).nav('task'));
  await page.locator('#choice2026Select').selectOption('II');
  await page.evaluate(()=>(window as any).nav('write'));
  await expect(page.locator('#studentTextA')).toHaveValue('');
  await page.locator('#studentTextA').fill('Antwort zu II.');
  await page.evaluate(()=>(window as any).saveSession());
  await page.reload();
  await page.evaluate(()=>(window as any).nav('task'));
  await page.locator('#choice2026Select').selectOption('I');
  await page.evaluate(()=>(window as any).nav('write'));
  expect(await page.locator('#studentTextA').inputValue()).toContain('Antwort zu I.');
  await page.locator('#submitBtn').click();
  await expect(page.locator('#scoreTotal')).toHaveText('10');
  expect(sent.exam_format).toBe('choice-ea-2026-v1');expect(sent.selected_task.id).toBe('I');
  expect(sent.student_text_b).toBe('');
  await page.evaluate(()=>(window as any).nav('task'));
  await page.locator('#choice2026Select').selectOption('II');
  await page.evaluate(()=>(window as any).nav('feedback'));
  await expect(page.locator('#feedbackBody')).not.toContainText('Gewählte Aufgabe bewertet');
  await page.evaluate(()=>{(window as any).eval('CONFIG.storedData={task_instruction_a:"Alte Aufgabe A",task_instruction_b:"Alte Aufgabe B",materials:[]}');(window as any).eval('renderTask(CONFIG.storedData)');(window as any).nav('write');});
  await expect(page.locator('#studentTextB')).toBeVisible();expect(errors).toEqual([]);
 });
}
for(const [file,format,weights]of [['writing.html','en-ea-2026-II',[20,40,40]],['francais-schreiben.html','fr-ea-2026',[30,40,30]]] as const){
 test(file+': Gewichte bleiben bei Wiederherstellung erhalten',async({page})=>{
  let payload:any;
  await page.route('**/api/generate',route=>{payload=route.request().postDataJSON();return route.fulfill({json:{headline:'Übung',article_text:'Vollständiger Ausgangstext für die Aufgabe.',task_1:'Aufgabe eins',task_2:'Aufgabe zwei',task_3_1:'Aufgabe drei',task_3_2:'Alternative'}});});
  await page.goto('/'+file);
  if(file==='writing.html')await page.locator('#textTypeSelect').selectOption('literarisch');
  await page.locator('#generateBtn').click();
  await expect(page.locator('#articleTitle')).toHaveText('Übung');
  await expect(page.locator('#weightLabel1')).toContainText(weights[0]+'%');
  await expect(page.locator('#weightLabel2')).toContainText(weights[1]+'%');
  expect(payload.prompt_template).not.toContain('{weight');
  expect(await page.evaluate(()=>(window as any).eval('CONFIG.storedData.writing_format'))).toBe(format);
  await page.evaluate(()=>(window as any).saveSession());await page.reload();
  await page.evaluate(()=>(window as any).nav('task'));
  await expect(page.locator('#weightLabel1')).toContainText(weights[0]+'%');
 });
}
test('Geschichte: M1 ist ein fertiges Bild statt Erstellungsbeschreibung',async({page})=>{
 await page.route('**/api/generate-abitur-geschichte',route=>route.fulfill({json:{task_instruction_a:'Analysieren Sie M1.',task_instruction_b:'Beurteilen Sie.',primary_type_a:'karikatur',primary_text_a:'Create an editorial cartoon about political power.',primary_meta_a:'KI-Übungskarikatur'}}));
 await page.goto('/geschichte-abitur.html');await page.locator('#primaryTypeSelect').selectOption('karikatur');await page.locator('#generateBtn').click();
 await expect(page.locator('#sourceText [data-image-state="ready"]')).toHaveCount(1);
 await expect(page.locator('#sourceText')).not.toContainText('Create an editorial');
 await page.evaluate(()=>(window as any).nav('write'));
 await expect(page.locator('#writeSourceRef img')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).collectExamMaterialImages().length)).toBe(1);
});
for(const width of [390,820,1180]) {
 test('Neue Eingaben ohne horizontalen Überlauf bei '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:900});
  for(const file of ['ethik-abitur.html','religion-abitur.html','interpretation.html','geschichte-abitur.html','pug-abitur.html','writing.html','francais-schreiben.html']) {
   await page.goto('/'+file);
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),file+' '+theme).toBe(true);
   }
  }
 });
}
test('PuG: Flyer ist eindeutig Teil B zugeordnet',async({page})=>{
 await page.route('**/api/generate-abitur-pug',route=>route.fulfill({json:{task_instruction_a:'Analysieren Sie A1.',task_instruction_b:'Analysieren Sie B1.',materials:[{id:'A1',part:'A',type:'text',title:'Text',content:'Vollständiger Sachtext.'},{id:'B1',part:'B',type:'bild',title:'Flyer',content:'Create a complete fictional German campaign flyer.'}]}}));
 await page.goto('/pug-abitur.html');await page.locator('#generateBtn').click();
 await expect(page.locator('#materialsContainer')).toContainText('B1 · Teil B');
 await expect(page.locator('#materialsContainer [data-image-state="ready"]')).toHaveCount(1);
 await page.evaluate(()=>(window as any).nav('write'));
 await expect(page.locator('#writeMaterialsRef')).toContainText('B1 · Teil B');
 await expect(page.locator('#writeMaterialsRef img')).toBeVisible();
});
