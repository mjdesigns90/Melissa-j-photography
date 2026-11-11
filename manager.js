'use strict';
const categories = ['business','families','seniors','equine','events','fine-art'];
const names = ['Business','Families','Seniors','Equine','Events','Fine Art'];
const $ = id => document.getElementById(id);
let photos = [], dirty = false, db, removed = [];
const message = text => $('status').textContent = text;
function el(tag, text, parent) { const n = document.createElement(tag); if(text !== undefined) n.textContent = text; if(parent) parent.append(n); return n; }
categories.forEach((c,i)=>{const o=el('option',names[i],$('category'));o.value=c;});
function changed(){dirty=true;message('Unsaved changes — choose Save Draft to keep them on this browser.');$('preview-panel').hidden=true;}
function render(focusId){
 $('photos').replaceChildren();
 const list=photos.filter(p=>p.category===$('category').value);
 if(!list.length) el('p','No photographs here yet. Add photos to begin.',$('photos'));
 list.forEach((p,i)=>{
  const card=el('article',undefined,$('photos'));card.className='card';
  const img=el('img',undefined,card);img.src=p.src;img.alt=p.alt;
  el('p',p.name,card).className='filename';
  const label=el('label','Photo description',card), input=el('input',undefined,label);input.value=p.alt;input.maxLength=300;
  input.oninput=()=>{p.alt=input.value;img.alt=p.alt;changed();};
  const layoutLabel=el('label','Layout',card),layout=el('select',undefined,layoutLabel);
  ['wide','tall','full'].forEach(v=>{const o=el('option',({wide:'Wide',tall:'Portrait',full:'Full width'})[v],layout);o.value=v;});layout.value=p.layout;
  layout.onchange=()=>{p.layout=layout.value;changed();};
  const groupLabel=el('label','Gallery',card), group=el('select',undefined,groupLabel);
  categories.forEach((v,j)=>{const o=el('option',names[j],group);o.value=v;});group.value=p.category;
  group.onchange=()=>{p.category=group.value;changed();render();};
  const actions=el('div',undefined,card);actions.className='actions';
  [-1,1].forEach(dir=>{const b=el('button',dir<0?'Move earlier':'Move later',actions);b.disabled=dir<0?i===0:i===list.length-1;b.onclick=()=>{
   const a=photos.indexOf(p),other=photos.indexOf(list[i+dir]);[photos[a],photos[other]]=[photos[other],photos[a]];changed();render(p.id);
  };});
  card.dataset.id=p.id;
  const remove=el('button','Remove',actions);remove.onclick=()=>{removed.push({photo:p,index:photos.indexOf(p)});photos=photos.filter(x=>x.id!==p.id);changed();render();$('undo').hidden=false;message('Photo removed from this draft. Your original file is unchanged. You can undo this removal.');};
 });
 if(focusId) [...$('photos').children].find(c=>c.dataset.id===focusId)?.querySelector('button:not(:disabled)')?.focus();
}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('mj-portfolio-local-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function readDraft(){return new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get('portfolio');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function valid(items){return Array.isArray(items)&&items.length<=300&&items.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.alt==='string'&&categories.includes(p.category)&&['wide','tall','full'].includes(p.layout)&&typeof p.src==='string'&&(/^(images\/[^<>]+)$/i.test(p.src)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.src)));}
$('category').onchange=()=>render();
$('undo').onclick=()=>{const last=removed.pop();if(!last)return;photos.splice(last.index,0,last.photo);$('category').value=last.photo.category;changed();render();$('undo').hidden=!removed.length;message('Photo restored to the draft. Save Draft to keep this change.');};
$('save').onclick=async()=>{
 const button=$('save');button.disabled=true;
 const snapshot=structuredClone(photos);
 try{
  await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({version:1,photos:snapshot,savedAt:new Date().toISOString()},'portfolio');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  dirty=JSON.stringify(photos)!==JSON.stringify(snapshot);
  message(dirty?'Draft saved; newer changes still need saving.':'Draft saved on this browser at '+new Date().toLocaleTimeString()+'. Your live website is unchanged.');
 }catch{message('Draft could not be saved. Browser storage may be full or unavailable. Keep this page open and your original files.');}finally{button.disabled=false;}
};
$('upload').onchange=async()=>{
 const files=[...$('upload').files];$('upload').disabled=true;
 const category=$('category').value;let added=0,failed=0;
 for(const file of files){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024||photos.length>=300){failed++;continue;}
  try{
   const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
   await new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=src;});
   photos.push({id:crypto.randomUUID(),src,name:file.name,alt:file.name.replace(/\.[^.]+$/,''),category,layout:'wide'});added++;
  }catch{failed++;}
 }
 if(added)changed();render();
 message(added+' photo(s) added to the draft. Save Draft to keep them.'+(failed?' '+failed+' skipped: use valid JPG, PNG or WebP files under 12 MB; maximum 300 photos.':''));
 $('upload').value='';$('upload').disabled=false;
};
$('preview').onclick=()=>{
 const snapshot=structuredClone(photos),frame=$('frame');$('preview-panel').hidden=false;
 frame.onload=()=>{
  const doc=frame.contentDocument;
  categories.forEach(category=>{
   const gallery=doc.querySelector('#'+category+' .gallery');gallery.replaceChildren();
   snapshot.filter(p=>p.category===category).forEach(p=>{const f=doc.createElement('figure');f.className='photo photo-'+p.layout;const img=doc.createElement('img');img.src=p.src;img.alt=p.alt;f.append(img);gallery.append(f);});
  });
  const style=doc.createElement('style');style.textContent='.photo img{height:auto!important;aspect-ratio:auto!important;object-fit:contain!important;transform:none!important}';doc.head.append(style);
 };
 frame.src='portfolio.html?draft='+Date.now();$('preview-panel').scrollIntoView({behavior:'smooth'});
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{
 try{
  const response=await fetch('portfolio.html');if(!response.ok)throw Error('Portfolio not found');
  const doc=new DOMParser().parseFromString(await response.text(),'text/html');
  categories.forEach(category=>doc.querySelectorAll('#'+category+' .gallery figure').forEach((f,i)=>{
   const img=f.querySelector('img');photos.push({id:category+'-'+i,category,src:img.getAttribute('src'),name:img.getAttribute('src').split('/').pop(),alt:img.alt,layout:f.classList.contains('photo-tall')?'tall':f.classList.contains('photo-full')?'full':'wide'});
  }));
  db=await openDb();const saved=await readDraft();
  if(saved){if(saved.version!==1||!valid(saved.photos))throw Error('The saved draft is not valid.');photos=saved.photos;}
  render();$('save').disabled=false;$('preview').disabled=false;message(saved?'Saved draft restored from this browser.':'Your existing portfolio is ready. Choose a gallery to begin.');
 }catch(error){message('Unable to open the manager: '+error.message+' Please use the local preview link in a browser with storage enabled.');$('upload').disabled=true;}
})();
