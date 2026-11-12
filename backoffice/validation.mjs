import {randomUUID} from 'node:crypto';
export const categories=['business','families','seniors','equine','events','fine-art'];
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const originals=[
 ['business','DSC_5826.jpg','Professional branding photography in Ocala Florida','wide'],
 ['families','DSC_10129.jpg','Family photography in Ocala Florida','wide'],
 ['seniors','DSC_4622Grad-For Web-2.jpg','Senior graduation photography in Ocala Florida','wide'],
 ['seniors','DSC_4670Grad-For Web-2.jpg','Ocala senior portrait photography','tall'],
 ['seniors','DSC_4710Grad-For Web-2.jpg','Graduation portrait in Ocala Florida','tall'],
 ['seniors','DSC_7463-EditGrad 2-For Web-2.jpg','Central Florida senior photography','wide'],
 ['seniors','DSC_7493-EditGrad 1-For Web-2.jpg','Senior graduation session in Ocala Florida','full'],
 ['fine-art','DSC_1814-Edit.jpg','Florida sunset fine art photography','wide']
];
export const originalPaths=new Set(originals.map(p=>'images/'+p[1]));
export function seed(){return originals.map(p=>({id:randomUUID(),category:p[0],name:p[1],alt:p[2],layout:p[3],src:'images/'+p[1]}));}
export function sanitizeDraft(input){
 if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||!Array.isArray(input.photos)||input.photos.length>300)throw Object.assign(Error('Invalid draft.'),{status:400});
 const seen=new Set();
 const photos=input.photos.map(p=>{
  if(!p||!uuid.test(p.id)||seen.has(p.id)||!categories.includes(p.category)||!['wide','tall','full'].includes(p.layout)||typeof p.name!=='string'||p.name.length>200||typeof p.alt!=='string'||p.alt.length>300)throw Object.assign(Error('Invalid photo details.'),{status:400});
  seen.add(p.id);
  if(p.assetId&&!uuid.test(p.assetId))throw Object.assign(Error('Invalid photo reference.'),{status:400});
  if(!p.assetId&&!originalPaths.has(p.src))throw Object.assign(Error('Unknown photograph.'),{status:400});
  return {id:p.id,category:p.category,name:p.name,alt:p.alt,layout:p.layout,...(p.assetId?{assetId:p.assetId,src:'/api/photos/'+p.assetId}:{src:p.src})};
 });
 return {revision:input.revision,photos};
}
