import DOMPurify from 'dompurify';

/** Credentials remain in this module's memory, never URL or browser storage. */
export function attachProtectedReader({window:win=window,apiBase,fetcher=fetch}={}){
  const doc=win.document,outline=doc.querySelector('.reading-outline'),root=outline??doc.body;
  const purifier=DOMPurify.sanitize?DOMPurify:DOMPurify(win);
  const base=new URL(apiBase,win.location.href);
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('Private API requires HTTPS');
  const original=new Map([...root.querySelectorAll('[data-publication-state="protected"]')].map(node=>[node.id,node.cloneNode(true)]));
  let token='',epoch=0,sessionEpoch=0,user=null,expiry=0,expiryTimer=null,pending=null,lastRequested=null,controller=null;
  const loaded=new Set(),blobs=new Set(),privateSections=new Set();
  const dialog=doc.createElement('dialog');dialog.className='protected-login';
  dialog.innerHTML='<form method="dialog"><p><strong>此页面需登录后查看</strong></p><label>邀请码 <input name="invitation" type="password" autocomplete="off" maxlength="256" required></label><p role="status" aria-live="polite"></p><button type="submit">登录查看</button> <button type="button" data-close>取消</button></form>';
  doc.body.append(dialog);const form=dialog.querySelector('form'),input=form.elements.invitation,status=dialog.querySelector('[role="status"]');
  const sessionButton=doc.createElement('button');sessionButton.type='button';sessionButton.textContent='邀请码登录';
  const mountSession=()=>{(doc.querySelector('.site-header-inner')??root.querySelector('.outline-toolbar-tools')??root).append(sessionButton);};mountSession();
  const refresh=()=>{if(outline)win.dispatchEvent(new win.CustomEvent('personal-outline-changed'));mountSession();};
  const clearContent=()=>{
    for(const id of loaded){const node=doc.getElementById(id);if(node&&original.has(id))node.replaceWith(original.get(id).cloneNode(true));}
    loaded.clear();for(const blob of blobs)win.URL.revokeObjectURL(blob);blobs.clear();
    for(const section of privateSections)section.remove();privateSections.clear();
    refresh();
  };
  const wipe=()=>{
    epoch++;sessionEpoch++;controller?.abort();controller=null;token='';user=null;expiry=0;
    win.clearTimeout(expiryTimer);expiryTimer=null;delete root.dataset.privateSession;
    sessionButton.textContent='邀请码登录';clearContent();win.dispatchEvent(new win.CustomEvent('personal-session-changed'));
  };
  const request=async(route,options={})=>{
    const response=await fetcher(base.href.replace(/\/$/u,'')+route,{...options,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{...(options.headers??{}),...(token?{Authorization:'Bearer '+token}:{})}});
    if(!response.ok){let message;try{message=(await response.json()).detail;}catch{}const error=Error(typeof message==='string'?message:response.status===403?'当前邀请码组无权查看此页面':response.status===429?'尝试过于频繁，请稍后重试':response.status===401?'邀请码无效、已停用或登录已过期':'页面暂不可读取，请重试');error.status=response.status;if(response.status===401&&token)wipe();throw error;}
    return response;
  };
  const show=()=>{status.textContent='';if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');input.focus();}};
  const close=()=>{if(dialog.close)dialog.close();else dialog.removeAttribute('open');input.value='';};
  const open=async id=>{
    const target=doc.getElementById('node-'+id);if(!target||target.dataset.publicationState!=='protected'||loaded.has(target.id))return;
    pending=id;
    if(!token||Date.now()/1000>=expiry){if(token)wipe();show();return;}
    const generation=epoch;controller?.abort();controller=new AbortController();const signal=controller.signal;
    try{
      const payload=await(await request('/documents/'+encodeURIComponent(id),{signal})).json();
      if(generation!==epoch||signal.aborted)return;
      if(payload.id!==id||typeof payload.html!=='string'||!Array.isArray(payload.files))throw Error('页面响应无效');
      const template=doc.createElement('template');
      template.innerHTML=purifier.sanitize(payload.html,{FORBID_TAGS:['script','iframe','object','embed','form','input'],FORBID_ATTR:['style']});
      const replacement=template.content.firstElementChild;
      if(template.content.children.length!==1||replacement?.id!=='node-'+id||!replacement.matches('li.outline-node'))throw Error('页面响应无效');
      for(const element of replacement.querySelectorAll('[src],[srcset]')){
        if(!element.hasAttribute('data-private-asset'))throw Error('私密页面包含未授权的远程资源');
      }
      const assetIds=new Set([...replacement.querySelectorAll('[data-private-asset]')].map(element=>element.dataset.privateAsset));
      payload.files.forEach(file=>assetIds.add(file.id));const urls=new Map();
      for(const asset of assetIds){
        if(!/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/u.test(asset))throw Error('文件响应无效');
        const blob=await(await request('/documents/'+encodeURIComponent(id)+'/assets/'+asset,{signal})).blob();
        if(generation!==epoch||signal.aborted)return;
        const url=win.URL.createObjectURL(blob);blobs.add(url);urls.set(asset,url);
      }
      for(const element of replacement.querySelectorAll('[data-private-asset]'))element.setAttribute(element.tagName==='IMG'?'src':'href',urls.get(element.dataset.privateAsset));
      if(payload.files.length){
        const right=doc.querySelector('.sidebar.right');if(!right)throw Error('页面附件栏不可用');
        let sidebar=right.querySelector('[data-document-attachment-sidebar]');
        if(!sidebar){sidebar=doc.createElement('div');sidebar.className='backlinks document-attachment-sidebar';sidebar.dataset.documentAttachmentSidebar='';sidebar.setAttribute('role','complementary');sidebar.setAttribute('aria-label','附件');const heading=doc.createElement('h3');heading.textContent='附件';sidebar.append(heading);const backlinks=right.querySelector(':scope > .backlinks');backlinks?backlinks.after(sidebar):right.append(sidebar);}
        const section=doc.createElement('section');section.className='document-attachments';section.dataset.documentAttachmentsFor=id;section.setAttribute('aria-label','附件');
        const list=doc.createElement('ol');list.className='document-attachment-list';section.append(list);
        for(const [index,file] of payload.files.entries()){
          const format=file.id.split('.')[1],li=doc.createElement('li');li.dataset.documentAttachmentIndex=String(index+1);
          const icon=doc.createElement('span');icon.className='document-attachment-icon';icon.setAttribute('aria-hidden','true');icon.textContent='📎';li.append(icon);
          const name=doc.createElement('span');name.dataset.documentAttachmentName='';name.textContent=file.fileName;
          if(['pdf','png','jpg','jpeg','gif','webp','svg','txt','json','wav','mp3','mp4','webm'].includes(format)){
            const preview=doc.createElement('a');preview.href=urls.get(file.id);preview.target='_blank';preview.rel='noopener noreferrer';preview.setAttribute('aria-label','预览 '+format.toUpperCase()+'：'+file.fileName);preview.append(name);li.append(preview);
          }else li.append(name);
          const type=doc.createElement('span');type.className='periodical document-attachment-type';type.textContent=format.toUpperCase();li.append(type);
          const download=doc.createElement('a');download.className='document-attachment-download';download.href=urls.get(file.id);download.download=file.fileName;download.setAttribute('aria-label','下载 '+file.fileName);download.textContent='下载';li.append(download);list.append(li);
        }
        sidebar.append(section);sidebar.hidden=false;privateSections.add(section);
      }
      if(generation!==epoch||signal.aborted)return;
      replacement.dataset.publicationState='protected';replacement.dataset.privateLoaded='true';
      doc.getElementById('node-'+id)?.replaceWith(replacement);loaded.add(replacement.id);refresh();close();
    }catch(error){if(signal.aborted||generation!==epoch)return;if(error.status===401)wipe();if(!dialog.open)show();status.textContent=error.message;}
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();const invitation=input.value;input.value='';status.textContent='正在登录…';
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{
      wipe();const generation=epoch;controller=new AbortController();const signal=controller.signal;
      const result=await(await request('/login',{signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invitation})})).json();
      if(generation!==epoch||signal.aborted)return;
      if(typeof result.token!=='string'||!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now()/1000)throw Error('登录响应无效');
      token=result.token;user=result.user;expiry=result.expiresAt;sessionEpoch++;root.dataset.privateSession='active';
      expiryTimer=win.setTimeout(wipe,Math.min(2147483647,Math.max(0,expiry*1000-Date.now())));
      sessionButton.textContent='退出登录';refresh();close();win.dispatchEvent(new win.CustomEvent('personal-session-changed'));if(pending)await open(pending);
    }catch(error){if(error.name!=='AbortError')status.textContent=error.message;}finally{button.disabled=false;}
  });
  dialog.querySelector('[data-close]').onclick=close;
  sessionButton.onclick=async()=>{if(!token){show();return;}const previous=token;wipe();try{await request('/logout',{method:'POST',headers:{Authorization:'Bearer '+previous}});}catch{/* Local data is already cleared. */}};
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-protected-open]');if(button){event.preventDefault();void open(button.dataset.protectedOpen);return;}
  });
  const focused=()=>{
    const id=win.location.hash.slice(1)||root.dataset.documentTitleSource;
    const target=id?doc.getElementById(id):null;
    const context=target?.closest('[data-rem-type="document"],[data-rem-type="dailyDocument"],[data-publication-state="protected"]');
    if(loaded.size&&!loaded.has(context?.id)){
      epoch++;controller?.abort();controller=null;clearContent();
    }
    if(pending&&context?.id!=='node-'+pending){
      epoch++;controller?.abort();controller=null;pending=null;close();
    }
    if(id&&id!==lastRequested){lastRequested=id;void open(id.replace(/^node-/u,''));}
    if(!id)lastRequested=null;
  };
  win.addEventListener('hashchange',focused);win.addEventListener('popstate',focused);win.addEventListener('pagehide',wipe);
  win.addEventListener('personal-outline-focus-changed',focused);
  focused();return {wipe,open,dialog,request,showLogin:show,get user(){return user;},get epoch(){return sessionEpoch;},get authenticated(){return !!token&&Date.now()/1000<expiry;}};
}

if(typeof window!=='undefined'){
  const start=async()=>{
    const response=await fetch('/static/private-backend.json',{credentials:'omit',cache:'no-store'});
    if(!response.ok)return;const config=await response.json();const session=attachProtectedReader({apiBase:config.apiBase});
    const {attachCollaboration}=await import('./collaboration/controller.mjs');attachCollaboration(session);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void start());else void start();
}
