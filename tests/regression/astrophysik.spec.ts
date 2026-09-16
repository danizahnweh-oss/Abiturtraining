import {test,expect} from '@playwright/test';
test('Eigene Bewertung und Musterlösung erhalten genau drei vollständige Aufgaben',async({page})=>{
 let submitted:any;
 const result={aufgaben_be:[1,2,3].map(id=>({id:String(id),erreichte_be:20,max_be:30})),gesamt_be:60,max_be:90,note:9,feedback:'Gesicherte Astro-Rückmeldung'};
 await page.route('**/api/grade-submit',route=>{submitted=route.request().postDataJSON();return route.fulfill({json:{job_id:'astro-test'}});});
 await page.route('**/api/grade-status/astro-test',route=>route.fulfill({json:{status:'completed',result}}));
 await page.route('**/api/model-answer-abitur-astrophysik',route=>{
  expect(route.request().postDataJSON().aufgaben).toHaveLength(3);
  return route.fulfill({json:{model_answer:'Astro-Musterlösung mit vollständigen Daten'}});
 });
 await page.goto('/astrophysik-abitur.html');await page.locator('#generateBtn').click();
 await expect(page.locator('.aufgabengruppe-card')).toHaveCount(4);
 await expect(page.locator('#studentGreeting')).toContainText('gA (Prüfung)');
 for(const i of [0,1,2])await page.locator('.aufgabengruppe-card').nth(i).press('Space');
 await page.evaluate(()=>(window as any).nav('write'));
 await page.locator('#studentText_0').fill('Meine ausführliche Lösung erklärt den Versuch und beschreibt alle Beobachtungen mit passenden physikalischen Einheiten.');
 await page.locator('#submitBtn').click();
 await expect(page.locator('#scoreBE')).toHaveText('60');
 expect(submitted.endpoint).toBe('grade-abitur-astrophysik');
 expect(submitted.aufgaben).toHaveLength(3);
 expect(submitted.aufgaben[0].material[0].text).toContain('20 Lichtjahre');
 await page.locator('#showModelBtn').click();
 await expect(page.locator('#modelAnswerBody')).toContainText('Astro-Musterlösung');
 await page.reload();await page.evaluate(()=>(window as any).nav('feedback'));
 await expect(page.locator('#feedbackBody')).toContainText('Gesicherte Astro-Rückmeldung');
});
const exam={aufgaben:['Induktion','Wellen','Sterne','Sternsysteme'].map((titel,i)=>({id:String(i+1),titel,sachgebiet:titel,text:'Kontext der Aufgabe',gesamt_be:30,material:[{id:'M1',type:'diagramm',chart_type:'line',titel:'Versuchsdaten',text:'Vollständige fiktive Daten: Die Entfernung beträgt 20 Lichtjahre.\n\n| Zeit (s) | Spannung (V) |\n| --- | --- |\n| 0 | 1 |\n| 2 | 4 |\n| 10 | 2 |'}],teilaufgaben:[{id:'a',text:'Erklären Sie die Beobachtung.',be:30}]}))};
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{for(const [k,v]of Object.entries({access:'1',free_access:'1',student_name:'Fachtest',student_id:'fachtest',access_token:'test-token',student_level:'eA'}))sessionStorage.setItem(k,v);});
 await page.route('**/api/**',route=>route.fulfill({json:{status:'active',plan:'monthly'}}));
 await page.route('**/api/generate-abitur-astrophysik',route=>route.fulfill({json:exam}));
});
test('Getrenntes Fach, vollständige Materialien und stabile Entwürfe',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/astrophysik-abitur.html');
 await page.locator('#generateBtn').click();
 await expect(page.locator('.aufgabengruppe-card')).toHaveCount(4);
 for(const i of [0,1,2])await page.locator('.aufgabengruppe-card').nth(i).press('Space');
 await page.evaluate(()=>(window as any).nav('write'));
 await page.locator('#studentText_0').fill('Meine Antwort zu Induktion.');
 await expect(page.locator('#writeTaskRef')).toContainText('20 Lichtjahre');
 await page.evaluate(()=>{(window as any).nav('task');(window as any).toggleAufgabe(0);(window as any).toggleAufgabe(3);(window as any).nav('write');});
 await page.locator('#studentText_3').fill('Meine Antwort zu Sternsystemen.');
 await page.evaluate(()=>{(window as any).saveSession();});
 await page.reload();
 await page.evaluate(()=>{(window as any).nav('task');(window as any).toggleAufgabe(3);(window as any).toggleAufgabe(0);(window as any).nav('write');});
 await expect(page.locator('#studentText_0')).toHaveValue('Meine Antwort zu Induktion.');
 expect(await page.evaluate(()=>sessionStorage.getItem('student_level'))).toBe('eA');
 await page.evaluate(()=>(window as any).generateTask());
 await expect(page.locator('#generateBtn')).toBeEnabled();
 await expect(page.locator('.aufgabengruppe-card[aria-checked="true"]')).toHaveCount(0);
 await page.evaluate(()=>{for(const i of [0,1,2])(window as any).toggleAufgabe(i);(window as any).nav('write');});
 await expect(page.locator('#studentText_0')).toHaveValue('');
 expect(errors).toEqual([]);
});
for(const width of [390,768,1024,1440])for(const colorScheme of ['light','dark'] as const){
 test('Layout '+width+' '+colorScheme,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme});
 await page.goto('/astrophysik-abitur.html');await page.locator('#generateBtn').click();
 await expect(page.locator('.aufgabengruppe-card')).toHaveCount(4);
 await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
 if (await page.getByRole('button', { name: 'Ablehnen', exact: true }).isVisible()) await page.getByRole('button', { name: 'Ablehnen', exact: true }).click();
 await page.screenshot({path:test.info().outputPath('viewport.png')});
 await page.screenshot({path:test.info().outputPath('layout.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
