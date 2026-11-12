'use strict';
const status=document.getElementById('auth-status'),form=document.getElementById('request-link');
function busy(value){form.querySelectorAll('button,input').forEach(n=>n.disabled=value);}
form.onsubmit=async e=>{
 e.preventDefault();busy(true);
 try{
  const r=await fetch('/api/auth/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value})});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Please try again.');
  status.textContent='If this email is authorized, a sign-in link has been sent. Check your inbox and open the link in this same browser.';
  document.getElementById('email-help').hidden=false;
 }catch(e){status.textContent=e.message;}finally{busy(false);}
};
(async()=>{
 try{
  const r=await fetch('/api/session'),s=await r.json();
  if(s.authenticated){location.replace('/manager.html');return;}
  form.hidden=!s.configured;
  status.textContent=s.configured?'Sign in with a one-time email link.':'Private sign-in is not connected yet. Your Supabase project still needs to be connected. No photos have been uploaded.';
 }catch{status.textContent='Unable to reach the private server. Please try again.';}
})();
