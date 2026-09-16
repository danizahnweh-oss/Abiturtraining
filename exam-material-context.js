/* Unterrichtsmaterial getrennt von hochgeladenen Schülerlösungen übertragen. */
function collectExamMaterialImages() {
 const task=document.getElementById((MODULE_CONFIG.sectionPrefix||'')+'task');
 return Array.from(task?.querySelectorAll('[data-image-state="ready"] img')||[]).slice(0,8).map((img,i)=>{
  const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
  canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
  if(!canvas.width||!canvas.height)throw new Error('Ein Materialbild ist noch nicht vollständig geladen.');
  try{canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return {label:img.closest('.material-card')?.querySelector('h4')?.textContent||'Materialbild '+(i+1),data_url:canvas.toDataURL('image/jpeg',.9)};}
  catch{throw new Error('Ein Materialbild kann noch nicht zur Bewertung übertragen werden. Bitte die Aufgabe neu laden.');}
 });
}
