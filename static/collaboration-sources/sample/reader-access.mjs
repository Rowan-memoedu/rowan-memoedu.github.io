import {createInvitationSession} from './invitation-session.mjs';
import {createReaderContent} from './reader-content.mjs';
import {createReaderDelivery} from './reader-delivery.mjs';

/** Authentication UI. Once delivered, contents belong to the ordinary reader. */
export function attachProtectedReader({window:win=window,apiBase,fetcher=fetch}={}){
  const doc=win.document,root=doc.querySelector('.reading-outline')??doc.body;
  const session=createInvitationSession({window:win,apiBase,fetcher});
  const content=createReaderContent({window:win}),delivery=createReaderDelivery({window:win,session,content,fetcher});
  const dialog=doc.createElement('dialog');dialog.className='protected-login';
  dialog.innerHTML='<form method="dialog"><p><strong>此页面需登录后查看</strong></p><label>邀请码 <input name="invitation" type="password" autocomplete="off" maxlength="256" required></label><p role="status" aria-live="polite"></p><button type="submit">登录查看</button> <button type="button" data-close>取消</button></form>';
  doc.body.append(dialog);const form=dialog.querySelector('form'),input=form.elements.invitation,status=dialog.querySelector('[role=status]');
  const errorDialog=doc.createElement('dialog');errorDialog.className='protected-reading-error';
  errorDialog.innerHTML='<p role="status" aria-live="polite"></p><button type="button" data-retry>重试读取</button> <button type="button" data-close>关闭</button>';doc.body.append(errorDialog);
  const hide=node=>node.close?node.close():node.removeAttribute('open');
  const show=node=>{if(!node.open){if(node.showModal)node.showModal();else node.setAttribute('open','');}};
  const close=()=>{hide(dialog);input.value='';};dialog.querySelector('[data-close]').onclick=close;
  errorDialog.querySelector('[data-close]').onclick=()=>hide(errorDialog);
  const showLogin=()=>{status.textContent='';show(dialog);input.focus();};
  const button=doc.createElement('button');button.type='button';button.textContent='邀请码登录';
  (doc.querySelector('.site-header-inner')??root.querySelector('.outline-toolbar-tools')??root).append(button);
  let pending=null,lastFocus=null,reading=Promise.resolve();
  const report=error=>{
    if(error.name==='AbortError')return;
    if(error.status===401){if(pending)showLogin();return;}
    errorDialog.querySelector('[role=status]').textContent=error.message;show(errorDialog);
  };
  const load=()=>{reading=delivery.load().then(result=>{if(result)hide(errorDialog);return result;}).catch(report);return reading;};
  errorDialog.querySelector('[data-retry]').onclick=async()=>{hide(errorDialog);if(session.status==='unavailable')await session.restore();await load();};
  session.subscribe(()=>{
    delivery.clear();hide(errorDialog);
    button.textContent=session.authenticated?'退出登录':session.status==='unavailable'?'重试登录验证':'邀请码登录';
    win.dispatchEvent(new win.CustomEvent('personal-session-changed'));
    if(session.authenticated){close();void load();}
  });
  const ready=async()=>{await session.ready;await reading;await delivery.ready;};
  async function open(id){
    await ready();const target='node-'+id;
    if(content.available(target))return true;
    const node=doc.getElementById(target);
    if(!node&&!/^r-(?:[a-f0-9]{2}){1,256}$/u.test(id))return false;
    if(node&&!node.closest('[data-content-state="unavailable"]'))return false;
    pending=id;
    if(!session.authenticated){
      if(session.status==='unavailable')report(Error('登录验证暂不可用，请重试'));else showLogin();return false;
    }
    if(session.user?.role==='reader')return false;
    await load();return content.available(target);
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const invitation=input.value;input.value='';status.textContent='正在登录…';
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{await session.login(invitation);await ready();close();}catch(error){if(error.name!=='AbortError')status.textContent=error.message;}finally{submit.disabled=false;}
  });
  button.onclick=async()=>{await session.ready;if(session.status==='unavailable'){await session.restore();return;}if(!session.authenticated)showLogin();else await session.logout();};
  root.addEventListener('click',event=>{const button=event.target.closest('[data-protected-open]');if(button){event.preventDefault();void open(button.dataset.protectedOpen);}});
  const focused=()=>{
    const id=win.location.hash.slice(1)||root.dataset.documentTitleSource;
    if(id!==lastFocus){lastFocus=id;pending=null;close();if(id)void open(id.replace(/^node-/u,''));}
  };
  win.addEventListener('hashchange',focused);win.addEventListener('popstate',focused);
  win.addEventListener('personal-outline-focus-changed',focused);
  void session.ready.then(()=>{if(session.authenticated)void load();focused();});
  return {content,open,dialog,showLogin,request:session.request,wipe:session.clear,
    get ready(){return ready();},get status(){return session.status;},get user(){return session.user;},get epoch(){return session.epoch;},get authenticated(){return session.authenticated;}};
}
