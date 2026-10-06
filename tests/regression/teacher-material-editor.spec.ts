import {test,expect} from '@playwright/test';
const task={aufgabe:'Vergleichen Sie die Quellen.',article_text:'Original article',source_text_de:'Deutscher Ausgangstext',materials:[{id:'M1',type:'text',content:'Material one',source:'Archiv'}],materialien:[{nr:'M2',typ:'quelle',inhalt:'Material two'}],zusatz_materialien:[{id:'M3',type:'text',text:'Zusatztext'}],choices:[{id:'I',materials:[{id:'M4',type:'text',content:'Verschachtelter Text'}]}],gesamt_be:20};
test('edit every material format, save and reopen without losing changes',async({page})=>{
 let stored:any=structuredClone(task);
 await page.addInitScript(()=>localStorage.setItem('myabiflow_tracking_consent','rejected'));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;const body=route.request().postDataJSON()||{};
  let json:any={codes:[],results:[],students:[],tasks:[],credits_total:20,credits_remaining:20};
  if(path==='/api/teacher-auth-login')json={token:'teacher-test',teacher_id:'test',teacher_name:'Testlehrkraft',subjects:['english']};
  if(path==='/api/teacher-profile')json={name:'Testlehrkraft',subjects:['english']};
  if(path==='/api/teacher-tasks'&&body.action==='get')json={task:{title:'Materialprüfung',subject:'writing',subject_group:'english'},task_data:stored};
  if(path==='/api/teacher-tasks'&&body.action==='update'){stored=body.task_data;json={success:true};}
  await route.fulfill({json});
 });
 await page.goto('/lehrer.html');await page.locator('#teacherName').fill('Testlehrkraft');await page.locator('#teacherPw').fill('testpassword');await page.locator('#authBtn').click();await page.getByRole('tab',{name:'Aufgaben',exact:true}).click();
 await page.evaluate(()=>{(0,eval)('editTask("test-task")');});
 const fields=page.locator('textarea[data-material-field]');await expect(fields).toHaveCount(6);
 for(let i=0;i<6;i++)await fields.nth(i).fill('Geänderter Text '+i);
 await page.locator('#taskSaveBtn').click();await expect(page.locator('#taskStep3')).toBeHidden();
 expect(stored.materials[0]).toEqual({...task.materials[0],content:'Geänderter Text 2'});
 expect(stored.gesamt_be).toBe(20);expect(stored.aufgabe).toBe(task.aufgabe);
 await page.evaluate(()=>{(0,eval)('editTask("test-task")');});await expect(fields).toHaveCount(6);
 for(let i=0;i<6;i++)await expect(fields.nth(i)).toHaveValue('Geänderter Text '+i);
 await page.setViewportSize({width:820,height:1180});
 await expect(page.locator('.toast')).toHaveCount(0);
 expect(await fields.first().evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(250);
 await page.locator('#taskEditFields').screenshot({path:'/tmp/teacher-material-editor-tablet.png'});
 expect(await page.locator('#taskEditFields').evaluate(el=>el.scrollWidth>el.clientWidth+1)).toBe(false);
});
