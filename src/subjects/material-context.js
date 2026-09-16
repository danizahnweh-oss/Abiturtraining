// Abbildungen sind Aufgabenmaterial, nicht handschriftliche Schülerantworten.
export function withMaterialImages(content, images) {
 if(!Array.isArray(images)||!images.length)return content;
 const parts=typeof content==='string'?[{type:'text',text:content}]:content.slice();
 for(const image of images.slice(0,8)) {
  if(typeof image.data_url!=='string'||image.data_url.length>8*1024*1024||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.data_url))throw new Error('Ungültiges Aufgabenbild.');
  parts.push({type:'text',text:'AUFGABENMATERIAL (keine Schülerlösung): '+String(image.label||'Abbildung').slice(0,300)},{type:'image_url',image_url:{url:image.data_url,detail:'high'}});
 }
 return parts;
}
