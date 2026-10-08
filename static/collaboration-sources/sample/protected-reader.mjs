import DOMPurify from 'dompurify';
import {createInvitationSession} from './invitation-session.mjs';

/** Remember only the revocable session. Invitations and private bodies are never stored. */
export function attachProtectedReader({window:win=window,apiBase,fetcher=fetch}={}){
  const doc=win.document,outline=doc.querySelector('.reading-outline'),root=outline??doc.body;
  const purifier=DOMPurify.sanitize?DOMPurify:DOMPurify(win);
  const session=createInvitationSession({window:win,apiBase,fetcher});
  const original=new Map([...root.querySelectorAll('[data-publication-state="protected"]')].map(node=>[node.id,node.cloneNode(true)]));
  let epoch=0,pending=null,lastRequested=null;
  const controllers=new Map(),opening=new Map();
  const loaded=new Set(),blobs=new Set(),privateSections=new Set();
  const dialog=doc.createElement('dialog');dialog.className='protected-login';
  dialog.innerHTML='<form method="dialog"><p><strong>此页面需登录后查看</strong></p><label>邀请码 <input name="invitation" type="password" autocomplete="off" maxlength="256" required></label><p role="status" aria-live="polite"></p><button type="submit">登录查看</button> <button type="button" data-close>取消</button></form>';
  doc.body.append(dialog);const form=dialog.querySelector('form'),input=form.elements.invitation,status=dialog.querySelector('[role="status"]');
  const readError=doc.createElement('dialog');readError.className='protected-reading-error';
  readError.innerHTML='<p role="status" aria-live="polite"></p><button type="button" data-retry>重试读取</button> <button type="button" data-close>关闭</button>';doc.body.append(readError);
  const closeError=()=>{if(readError.close)readError.close();else readError.removeAttribute('open');};
  readError.querySelector('[data-close]').onclick=closeError;
  const sessionButton=doc.createElement('button');sessionButton.type='button';sessionButton.textContent='邀请码登录';
  const mountSession=()=>{(doc.querySelector('.site-header-inner')??root.querySelector('.outline-toolbar-tools')??root).append(sessionButton);};mountSession();
  const refresh=()=>{if(outline)win.dispatchEvent(new win.CustomEvent('personal-outline-changed'));mountSession();};
  const clearContent=()=>{
    for(const id of loaded){const node=doc.getElementById(id);if(node&&original.has(id))node.replaceWith(original.get(id).cloneNode(true));}
    loaded.clear();for(const blob of blobs)win.URL.revokeObjectURL(blob);blobs.clear();
    for(const section of privateSections)section.remove();privateSections.clear();
    refresh();
  };
  const wipe=session.clear,request=session.request;let sessionStatus=session.status;
  session.subscribe(()=>{
    const restoredSession=sessionStatus==='checking'&&session.authenticated;sessionStatus=session.status;
    epoch++;for(const controller of controllers.values())controller.abort();controllers.clear();opening.clear();
    if(session.authenticated&&session.user?.role!=='reader')root.dataset.privateSession='active';else{delete root.dataset.privateSession;clearContent();closeError();}
    sessionButton.textContent=session.authenticated?'退出登录':session.status==='unavailable'?'重试登录验证':'邀请码登录';refresh();
    win.dispatchEvent(new win.CustomEvent('personal-session-changed'));
    if(restoredSession)void session.ready.then(()=>{lastRequested=null;focused();});
  });
  const show=()=>{status.textContent='';if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');input.focus();}};
  const close=()=>{if(dialog.close)dialog.close();else dialog.removeAttribute('open');input.value='';};
  const showReadError=(message,retry)=>{
    readError.querySelector('[role="status"]').textContent=message;readError.querySelector('[data-retry]').onclick=()=>{closeError();void retry();};
    if(!readError.open){if(readError.showModal)readError.showModal();else readError.setAttribute('open','');}
  };
  const retrySession=async id=>{await session.restore();if(session.status==='unavailable'){showReadError('登录验证暂不可用，请重试',()=>retrySession(id));return;}if(id)await open(id);else if(!session.authenticated)show();};
  const loadDocument=async id=>{
    const target=doc.getElementById('node-'+id);if(!target||target.dataset.publicationState!=='protected')return false;if(target.dataset.privateLoaded==='true')return true;
    pending=id;
    if(!session.authenticated){if(session.status==='unavailable')showReadError('登录验证暂不可用，请重试',()=>retrySession(id));else show();return;}
    if(!original.has(target.id))original.set(target.id,target.cloneNode(true));
    const generation=epoch,controller=new AbortController();controllers.set(id,controller);const signal=controller.signal;
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
      doc.getElementById('node-'+id)?.replaceWith(replacement);loaded.add(replacement.id);refresh();close();closeError();return true;
    }catch(error){
      if(error.status===401&&!session.authenticated&&pending===id){show();status.textContent=error.message;return;}
      if(signal.aborted||generation!==epoch)return;
      if(!session.authenticated){show();status.textContent=error.message;return;}
      showReadError(error.name==='AbortError'?'页面读取超时，请重试':error.message,()=>open(id));
    }finally{if(controllers.get(id)===controller)controllers.delete(id);}
  };
  const open=async id=>{
    await session.ready;
    if(doc.getElementById('node-'+id)?.dataset.publicationState!=='protected')return false;
    if(opening.get(id)?.generation===epoch)return opening.get(id).task;
    const generation=epoch;
    const task=(async()=>{
      // Load only the requested path. Loading a parent later must not replace
      // an already opened child; siblings and descendants remain untouched.
      const parent=doc.getElementById('node-'+id)?.parentElement.closest('[data-publication-state="protected"]');
      if(session.authenticated&&parent&&parent.dataset.privateLoaded!=='true'){
        if(!await open(parent.id.replace(/^node-/u,''))||generation!==epoch)return false;
      }
      return loadDocument(id);
    })();opening.set(id,{generation,task});
    try{return await task;}finally{if(opening.get(id)?.task===task)opening.delete(id);}
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();const invitation=input.value;input.value='';status.textContent='正在登录…';
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{
      await session.login(invitation);close();if(pending)await open(pending);
    }catch(error){if(error.name!=='AbortError')status.textContent=error.message;}finally{button.disabled=false;}
  });
  dialog.querySelector('[data-close]').onclick=close;
  sessionButton.onclick=async()=>{await session.ready;if(session.status==='unavailable'){await retrySession(pending);return;}if(!session.authenticated){show();return;}await session.logout();};
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-protected-open]');if(button){event.preventDefault();void open(button.dataset.protectedOpen);return;}
  });
  const focused=()=>{
    const id=win.location.hash.slice(1)||root.dataset.documentTitleSource;
    const target=id?doc.getElementById(id):null;
    const context=target?.closest('[data-rem-type="document"],[data-rem-type="dailyDocument"],[data-publication-state="protected"]');
    if(pending&&context?.id!=='node-'+pending){
      pending=null;close();closeError();
    }
    if(id&&id!==lastRequested){lastRequested=id;void open(id.replace(/^node-/u,''));}
    if(!id)lastRequested=null;
  };
  win.addEventListener('hashchange',focused);win.addEventListener('popstate',focused);
  win.addEventListener('pageshow',event=>{if(event.persisted){lastRequested=null;void session.ready.then(focused);}});
  win.addEventListener('personal-outline-focus-changed',focused);
  win.addEventListener('personal-outline-expansion-changed',event=>{
    if(session.authenticated&&event.detail?.expanded)void open(event.detail.nodeId.replace(/^node-/u,''));
  });
  win.addEventListener('personal-outline-changed',()=>{
    if(!session.authenticated)return;
    for(const id of loaded){const node=doc.getElementById(id);if(node?.dataset.privateLoaded!=='true'&&node&&!node.classList.contains('is-folded'))void open(id.replace(/^node-/u,''));}
  });
  void session.ready.then(()=>{if(win.location.hash||root.dataset.documentTitleSource)focused();});
  return {wipe,open,dialog,request,showLogin:show,get ready(){return session.ready;},get user(){return session.user;},get epoch(){return session.epoch;},get authenticated(){return session.authenticated;}};
}

if(typeof window!=='undefined'){
  const start=async()=>{
    const response=await fetch('/static/private-backend.json',{credentials:'omit',cache:'no-store'});
    if(!response.ok)return;const config=await response.json();const session=attachProtectedReader({apiBase:config.apiBase});
    const {attachCollaboration}=await import('./collaboration/controller.mjs');attachCollaboration(session);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void start());else void start();
}
