import { test, expect } from '@playwright/test';
const task={thema:'Genetik',aufgabe:'Untersuchen Sie den Versuch.',gesamt_be:5,teilaufgaben:[{id:'a)',text:'Erklären Sie die Replikation.',be:5}],material:[{id:'M1',type:'text',text:'Unveränderte Quelle.'}]};
const proposed='Erläutern Sie die semikonservative Replikation.';
async function openEditor(page:any){
 let saved:any=null;
 await page.addInitScript(()=>localStorage.setItem('myabiflow_tracking_consent','rejected'));
 await page.route('**/api/**',async(route:any)=>{
  const path=new URL(route.request().url()).pathname;const body=route.request().postDataJSON()||{};
  let json:any={codes:[],results:[],students:[],tasks:[],credits_total:20,credits_remaining:20};
  if(path==='/api/teacher-auth-login')json={token:'teacher-test-token',teacher_id:'test',teacher_name:'Testlehrkraft',subjects:['biologie']};
  if(path==='/api/teacher-profile')json={name:'Testlehrkraft',subjects:['biologie']};
  if(path==='/api/generate-teacher-revision'){
   expect(route.request().headers()['x-teacher-auth-token']).toBe('teacher-test-token');
   expect(body.instructions).toBeTruthy();
   json={edits:[{path:['teilaufgaben',0,'text'],before:body.task_data.teilaufgaben[0].text,text:proposed,reason:'Präzisiert das Verfahren.'}]};
  }
  if(path==='/api/teacher-tasks'&&body.action==='save'){saved=body;json={share_code:'TEST42'};}
  await route.fulfill({json});
 });
 await page.goto('/lehrer.html');await page.locator('#teacherName').fill('Testlehrkraft');await page.locator('#teacherPw').fill('testpassword');await page.locator('#authBtn').click();
 await page.getByRole('tab',{name:'Aufgaben',exact:true}).click();
 await page.evaluate((data:any)=>{(0,eval)('pendingTaskData = '+JSON.stringify(data)+'; pendingTaskSubject="biologie";pendingTaskSubjectGroup="biologie";document.getElementById("taskStep1").style.display="none";showTaskPreview();');},task);
 // The task editor lives in the tasks tab.
 await page.evaluate(()=>{document.querySelectorAll('.tab-content').forEach((node:any)=>{if(node.contains(document.getElementById('taskStep3')))node.style.display='block';});});
 await page.locator('#taskTitleInput').fill('Genetik');
 return ()=>saved;
}
test('teacher previews, applies, undoes and explicitly saves revised draft',async({page})=>{
 const saved=await openEditor(page);
 await page.getByRole('button',{name:'Klarer formulieren',exact:true}).click();await page.locator('#revisionGenerate').click();
 await expect(page.locator('#revisionProposal')).toBeVisible();
 await expect(page.locator('textarea[data-field="teilaufgaben"]')).toHaveValue(task.teilaufgaben[0].text);
 expect(saved()).toBeNull();
 await page.locator('#revisionApply').click();await expect(page.locator('textarea[data-field="teilaufgaben"]')).toHaveValue(proposed);
 await page.locator('#revisionUndo').click();await expect(page.locator('textarea[data-field="teilaufgaben"]')).toHaveValue(task.teilaufgaben[0].text);
 await page.getByRole('button',{name:'Klarer formulieren',exact:true}).click();await page.locator('#revisionGenerate').click();await expect(page.locator('#revisionProposal')).toBeVisible();
 await page.screenshot({path:'/tmp/teacher-revision-desktop.png',fullPage:true});
 await page.locator('#revisionApply').click();await page.locator('#taskSaveBtn').click();
 await expect(page.locator('#taskShareCode')).toHaveText('TEST42');
 expect(saved().task_data.teilaufgaben[0]).toEqual({...task.teilaufgaben[0],text:proposed});
 expect(saved().task_data.material).toEqual(task.material);
});
test('stale proposals never overwrite manual edits; mobile comparison fits',async({page})=>{
 await page.setViewportSize({width:390,height:844});await openEditor(page);
 await page.getByRole('button',{name:'Klarer formulieren',exact:true}).click();await page.locator('#revisionGenerate').click();await expect(page.locator('#revisionProposal')).toBeVisible();
 await page.locator('.task-revision').screenshot({path:'/tmp/teacher-revision-mobile.png'});
 await page.getByRole('button',{name:'Dark Mode umschalten'}).click();
 await page.locator('.task-revision').screenshot({path:'/tmp/teacher-revision-dark.png'});
 const overflows=await page.locator('.task-revision').evaluate(el=>el.scrollWidth>el.clientWidth+1);expect(overflows).toBe(false);
 await page.locator('textarea[data-field="teilaufgaben"]').fill('Manuell bearbeitet.');await page.locator('#revisionApply').click();
 await expect(page.locator('#revisionStatus')).toContainText('inzwischen bearbeitet');await expect(page.locator('textarea[data-field="teilaufgaben"]')).toHaveValue('Manuell bearbeitet.');
 await page.locator('#revisionDiscard').click();await expect(page.locator('#revisionProposal')).toBeHidden();
});

test('failed requests keep the draft and release the button for retry', async ({page}) => {
 await openEditor(page);
 await page.route('**/api/generate-teacher-revision', route => route.fulfill({status:502,json:{error:'Fachliche Kontrolle fehlgeschlagen.'}}));
 await page.getByRole('button',{name:'Klarer formulieren',exact:true}).click();await page.locator('#revisionGenerate').click();
 await expect(page.locator('#revisionStatus')).toContainText('Fachliche Kontrolle');
 await expect(page.locator('#revisionGenerate')).toBeEnabled();
 await expect(page.locator('textarea[data-field="teilaufgaben"]')).toHaveValue(task.teilaufgaben[0].text);
 await expect(page.locator('#revisionProposal')).toBeHidden();
});
