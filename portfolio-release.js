'use strict';
(async()=>{
 const gateway='https://mjphotography-client-galleries.nearwren33.chatgpt.site/api/portfolio-release';
 const categories=['business','families','seniors','equine','events','fine-art'];
 const galleries=Object.fromEntries(categories.map(id=>[id,document.getElementById(id)?.querySelector('.gallery')]));
 if(!categories.every(id=>galleries[id]))return;
 const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
 const allowedAsset=/^images\/[a-zA-Z0-9._ -]+\.jpe?g$/i;
 function valid(item){
   return item&&categories.includes(item.category)&&['wide','tall','full'].includes(item.layout)&&typeof item.alt==='string'&&item.alt.length<=180&&
      (item.asset===undefined?uuid.test(item.id):typeof item.asset==='string'&&allowedAsset.test(item.asset));
 }
 const ctr=new AbortController(), timeout=setTimeout(()=>ctr.abort(),7000);
 try{
   const response=await fetch(gateway,{credentials:'omit',cache:'no-store',redirect:'error',signal:ctr.signal});
   if(!response.ok)throw new Error();
   const {revision,photos}=await response.json();
   if(revision===null&&photos===null)return; // No approved release yet: leave the original Portfolio untouched.
   if(!Number.isSafeInteger(revision)||revision<1||!Array.isArray(photos)||photos.length>160||
      !photos.every(valid)||new Set(photos.map(p=>p.id)).size!==photos.length)throw new Error();
   const fragments=Object.fromEntries(categories.map(id=>[id,document.createDocumentFragment()]));
   for(const photo of photos){
     const figure=document.createElement('figure');figure.className='photo photo-'+photo.layout;
     const image=document.createElement('img');image.src=photo.asset||gateway+'/photo/'+photo.id;image.alt=photo.alt;image.loading='lazy';image.decoding='async';
     figure.append(image);fragments[photo.category].append(figure);
   }
   for(const id of categories)galleries[id].replaceChildren(fragments[id]);
 }catch{
   // Avoid accidentally restoring an old photo after the owner removed it.
   for(const id of categories)galleries[id].replaceChildren();
   const notice=document.createElement('p');notice.textContent='Portfolio photos are temporarily unavailable. Please try again in a moment.';
   document.querySelector('.portfolio-intro')?.append(notice);
 }finally{clearTimeout(timeout);}
})();
