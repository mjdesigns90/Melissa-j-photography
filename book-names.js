(() => {
  const form=document.querySelector('#inquiry-form');
  if(!form) return;
  const field=id=>document.getElementById(id);
  const service=field('service');
  const picked=new URLSearchParams(location.search).get('service');
  if(Array.from(service.options).some(option=>option.value===picked)) service.value=picked;
  const submit=field('review-inquiry'), clear=field('clear-inquiry'), status=field('inquiry-status'), result=field('inquiry-result');
  const formId=form.dataset.formspreeId||'';
  // Form IDs are public routing identifiers, not API keys.
  const endpoint=/^[A-Za-z0-9]{6,64}$/.test(formId)?'https://formspree.io/f/'+formId:null;
  let busy=false;
  clear.hidden=false;
  submit.disabled=!endpoint;
  if(!endpoint) status.textContent='The form isn’t connected here. Please use the email link above.';
  const pending=on=>{busy=on; submit.disabled=on||!endpoint; clear.disabled=on;};
  clear.addEventListener('click',()=>{form.reset();if(endpoint)status.textContent='';service.focus();});
  field('edit-inquiry').addEventListener('click',()=>{result.hidden=true;form.hidden=false;service.focus();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!endpoint) return;
    const firstName=field('client-first-name').value.trim(), lastName=field('client-last-name').value.trim();
    const details=field('details').value.trim();
    if(!firstName||!lastName||details.length<3){status.textContent='Enter your first and last name and at least a few words about the session.';field(!firstName?'client-first-name':!lastName?'client-last-name':'details').focus();return;}
    const name=firstName+' '+lastName;
    if(field('website').value){status.textContent='This inquiry could not be sent. Please use the email link above.';return;}
    const data=new FormData();
    for(const [key,value] of [['name',name],['first_name',firstName],['last_name',lastName],['email',field('client-email').value.trim()],['session',service.selectedOptions[0]?.text||''],['preferred_date',field('preferred-date').value||'Flexible'],['message',details],['_gotcha','']]) data.append(key,value);
    pending(true);
    status.textContent='Sending inquiry…';
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{Accept:'application/json'},body:data,
        credentials:'omit',redirect:'error',referrerPolicy:'strict-origin-when-cross-origin',signal:AbortSignal.timeout(12000)});
      if(response.status===429){status.textContent='Too many attempts right now. Wait a minute or use the email link above.';return;}
      let reply;
      if(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')){
        try{reply=await response.json();}catch{}
      }
      if(!response.ok||reply?.ok!==true){
        status.textContent=response.status===422?'I couldn’t confirm the inquiry was accepted. Check your details, or use the email link above.':
          'I couldn’t confirm your inquiry was accepted. If you email instead, mention that you tried the form so I can avoid a duplicate.';
        return;
      }
      form.reset();status.textContent='';form.hidden=true;result.hidden=false;result.focus();
    }catch{
      status.textContent='I couldn’t confirm your inquiry was accepted. If you email instead, mention that you tried the form so I can avoid a duplicate.';
    }finally{pending(false);}
  });
})();
