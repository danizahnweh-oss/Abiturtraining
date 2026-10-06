// Nur synthetische Browserdaten; keine realen Konten oder KI-Aufträge.
// Ausführen nach npm install: node tests/manual/privacy-network.cjs
const { chromium }=require('playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true}); const results=[];
 const paths=['landing.html','schulen.html','impressum.html','index.html?app=1&role=student','mathe.html','fos/index.html','lehrer.html','abo.html','abitur-kolloquium-trainer/dist/'];
 for(const consent of [false,true])for(const path of paths){
  const context=await browser.newContext({serviceWorkers:'allow'});
  await context.addInitScript((yes)=>{localStorage.setItem('myabiflow_tracking_preferences',JSON.stringify({analytics:yes,marketing:yes,version:2,saved_at:new Date().toISOString()}));},consent);
  // Keine Daten anlegen und keine KI-Aufträge oder E-Mails auslösen.
  await context.route('**/api/**',route=>route.request().method()==='POST'?route.fulfill({status:401,contentType:'application/json',body:'{"error":"synthetic audit context"}'}):route.continue());
  if(path.startsWith('abitur-kolloquium'))await context.addInitScript(()=>{sessionStorage.setItem('access','1');sessionStorage.setItem('student_name','Synthetic Privacy Test');sessionStorage.setItem('access_token','synthetic-invalid-token');});
  const external=new Set(); const page=await context.newPage();
  page.on('request',req=>{const u=new URL(req.url()); if(u.protocol.startsWith('http')&&u.hostname!=='myabiflow.de')external.add(u.hostname)});
  const response=await page.goto('https://myabiflow.de/'+path,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1500);
  const cookies=(await context.cookies()).map(c=>c.name);
  const tracking=[...external].filter(h=>/google|doubleclick|facebook/.test(h));
  const publicPage=['landing.html','schulen.html'].includes(path);
  const finalUrl=page.url(); const pass=response.status()===200&&((consent&&publicPage)||tracking.length===0);
  results.push({path,finalUrl,consent,status:response.status(),external:[...external],cookies,pass});
  await context.close();
 }
 await browser.close();fs.writeFileSync(process.env.PRIVACY_AUDIT_REPORT || '/tmp/myabiflow-privacy-network-after.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(x=>!x.pass))process.exitCode=1;
})();
