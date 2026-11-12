'use strict';
const categories = ['business','families','seniors','equine','events','fine-art'];
const names = ['Business','Families','Seniors','Equine','Events','Fine Art'];
const $ = id => document.getElementById(id);
let photos = [], dirty = false, revision = 0, removed = [];
const message = text => $('status').textContent = text;
function el(tag, text, parent) { const n = document.createElement(tag); if(text !== undefined) n.textContent = text; if(parent) parent.append(n); return n; }
categories.forEach((c,i)=>{const o=el('option',names[i],$('category'));o.value=c;});
function changed(){dirty=true;message('Unsaved changes — choose Save Draft to keep them privately online.');$('preview-panel').hidden=true;}
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
function lock(){ $('workspace').hidden=true; $('session-expired').hidden=false; }
async function api(path,options={}){
 const r=await fetch(path,options),data=await r.json();
 if(r.status===401||r.status===403)lock();
 if(!r.ok)throw Error(data.error||'Unable to complete this action. Please try again.');
 return data;
}
$('resume').onclick=async()=>{try{const s=await api('/api/session');if(!s.authenticated)return;photos.forEach(p=>{if(p.assetId)p.src='/api/photos/'+p.assetId;});render();$('workspace').hidden=false;$('session-expired').hidden=true;}catch{/* Keep workspace locked. */}};
$('logout').onclick=async()=>{
 if(dirty&&!confirm('Sign out without saving your latest changes?'))return;
 try{await api('/api/auth/logout',{method:'POST'});dirty=false;photos=[];$('photos').replaceChildren();$('frame').src='about:blank';location.replace('/login.html');}
 catch(e){message(e.message);}
};
$('category').onchange=()=>render();
$('undo').onclick=()=>{const last=removed.pop();if(!last)return;photos.splice(last.index,0,last.photo);$('category').value=last.photo.category;changed();render();$('undo').hidden=!removed.length;message('Photo restored to the draft. Save Draft to keep this change.');};
$('save').onclick=async()=>{
 const button=$('save');button.disabled=true;
 const snapshot=structuredClone(photos);
 try{
  const result=await api('/api/draft',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,photos:snapshot})});revision=result.revision;
  dirty=JSON.stringify(photos)!==JSON.stringify(snapshot);
  message(dirty?'Draft saved; newer changes still need saving.':'Draft saved privately online at '+new Date(result.savedAt).toLocaleTimeString()+'. Your live website is unchanged.');
 }catch(e){message(e.message);}finally{button.disabled=false;}
};
$('upload').onchange=async()=>{
 const files=[...$('upload').files];$('upload').disabled=true;
 const category=$('category').value;let added=0,failed=0;
 for(const file of files){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024||photos.length>=300){failed++;continue;}
  try{
   const uploaded=await api('/api/photos',{method:'POST',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:file});
   photos.push({id:crypto.randomUUID(),assetId:uploaded.assetId,src:uploaded.src,name:uploaded.name,alt:file.name.replace(/\.[^.]+$/,''),category,layout:'wide'});added++;
  }catch(e){failed++;message(e.message);break;}
 }
 if(added)changed();render();
 message(added+' photo(s) stored privately and added to this draft. Save Draft to keep their arrangement.'+(failed?' Some photos could not be added. Check your connection and use valid JPG, PNG or WebP files under 12 MB.':''));
 $('upload').value='';$('upload').disabled=false;
};
$('preview').onclick=()=>{
 const snapshot=structuredClone(photos),frame=$('frame');$('preview-panel').hidden=false;
 frame.onload=()=>{
  const doc=frame.contentDocument;
  categories.forEach(category=>{
   const gallery=doc.querySelector('#'+category+' .gallery');if(!gallery)return;gallery.replaceChildren();
   snapshot.filter(p=>p.category===category).forEach(p=>{const f=doc.createElement('figure');f.className='photo photo-'+p.layout;const img=doc.createElement('img');img.src=p.src;img.alt=p.alt;f.append(img);gallery.append(f);});
  });
  const style=doc.createElement('link');style.rel='stylesheet';style.href='/preview.css';doc.head.append(style);
 };
 frame.src='portfolio.html?draft='+Date.now();$('preview-panel').scrollIntoView({behavior:'smooth'});
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{
 try{
  const saved=await api('/api/draft');photos=saved.photos;revision=saved.revision;
  render();$('save').disabled=false;$('preview').disabled=false;message(saved.savedAt?'Your private online draft is ready.':'Your existing portfolio is ready. Save Draft to create your first private online draft.');
 }catch(error){message(error.message);$('upload').disabled=true;}
})();
async function checkSession(){try{const s=await api('/api/session');if(!s.authenticated)lock();}catch{lock();}}
window.addEventListener('pageshow',checkSession);
setInterval(checkSession,60000);
