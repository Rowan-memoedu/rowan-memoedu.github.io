/** Single authentication authority shared by private reading and collaboration. */
export function createInvitationSession({window:win=window,apiBase,fetcher=fetch}={}){
  const base=new URL(apiBase,win.location.href);
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('Private API requires HTTPS');
  const api=base.href.replace(/\/$/u,''),storageKey='personalwebsite-session-v1:'+api;
  let token='',user=null,expiresAt=0,epoch=0,timer=null,restoring=null,status='anonymous';
  const listeners=new Set(),controllers=new Set();
  const cancelled=()=>Object.assign(Error('登录状态已改变'),{name:'AbortError'});
  const read=()=>{try{return win.localStorage.getItem(storageKey);}catch{return null;}};
  const forget=()=>{try{win.localStorage.removeItem(storageKey);}catch{/* Storage may be disabled. */}};
  const persist=()=>{try{win.localStorage.setItem(storageKey,JSON.stringify({token,expiresAt}));}catch{/* Fall back to memory when browser storage is disabled. */}};
  const emit=()=>{for(const listener of listeners)listener();};
  function clear({forgetSession=true}={}){
    epoch++;for(const controller of controllers)controller.abort();controllers.clear();
    token='';user=null;expiresAt=0;status='anonymous';restoring=null;win.clearTimeout(timer);timer=null;
    if(forgetSession)forget();emit();
  }
  function activate(value){
    if(typeof value.token!=='string'||!/^[A-Za-z0-9_-]{40,100}$/u.test(value.token)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()/1000)throw Error('登录响应无效');
    token=value.token;user=value.user;expiresAt=value.expiresAt;status='authenticated';epoch++;
    const expire=()=>{const remaining=expiresAt*1000-Date.now();if(remaining<=0)clear();else timer=win.setTimeout(expire,Math.min(2147483647,remaining));};expire();
    persist();emit();
  }
  async function send(route,options={},credential=token){
    const controller=new AbortController();controllers.add(controller);
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)controller.abort();
    const timeout=win.setTimeout(abort,30000);
    try{return await fetcher(api+route,{...options,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{...(options.headers??{}),...(credential?{Authorization:'Bearer '+credential}:{})}});}
    finally{win.clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);controllers.delete(controller);}
  }
  async function request(route,options={}){
    const generation=epoch,credential=token;
    const response=await send(route,options,credential);
    if(generation!==epoch)throw cancelled();
    if(!response.ok){
      let message;try{message=(await response.json()).detail;}catch{}
      const error=Error(typeof message==='string'?message:response.status===403?'当前邀请码组无权查看此页面':response.status===429?'尝试过于频繁，请稍后重试':response.status===401?'邀请码无效、已停用或登录已过期':'页面暂不可读取，请重试');error.status=response.status;
      if(response.status===401&&credential&&generation===epoch)clear();throw error;
    }
    return response;
  }
  async function restoreSaved(){
    const abandon=()=>{forget();status='anonymous';emit();};
    const raw=read();if(!raw){status='anonymous';emit();return;}
    let saved;try{saved=JSON.parse(raw);}catch{abandon();return;}
    if(!saved||typeof saved.token!=='string'||!/^[A-Za-z0-9_-]{40,100}$/u.test(saved.token)||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Date.now()/1000){abandon();return;}
    const generation=epoch;
    status='checking';emit();
    try{
      const response=await send('/session',{},saved.token);if(generation!==epoch)return;
      if(response.status===401){forget();status='anonymous';emit();return;}if(!response.ok){status='unavailable';emit();return;}
      const value=await response.json();if(generation!==epoch)return;
      if(!value.user||typeof value.user.id!=='string'||typeof value.user.name!=='string'||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()/1000){forget();status='anonymous';emit();return;}
      activate({...value,token:saved.token});
    }catch{if(generation===epoch){status='unavailable';emit();}/* Connection failure preserves the remembered session for retry. */}
  }
  const restore=()=>{
    if(restoring)return restoring;
    const task=restoreSaved().finally(()=>{if(restoring===task)restoring=null;});restoring=task;return task;
  };
  async function login(invitation){
    clear();const generation=epoch;
    const value=await(await request('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invitation})})).json();
    if(generation!==epoch)throw cancelled();activate(value);
  }
  async function logout(){const previous=token;clear();if(previous)try{await send('/logout',{method:'POST'},previous);}catch{/* Local state has already been removed. */}}
  const storage=event=>{if(event.key!==storageKey&&event.key!==null)return;clear({forgetSession:false});restoring=null;void restore();};
  const pagehide=()=>clear({forgetSession:false});
  const pageshow=event=>{if(event.persisted)void restore();};
  win.addEventListener('storage',storage);win.addEventListener('pagehide',pagehide);win.addEventListener('pageshow',pageshow);
  if(read())void restore();
  return {request,login,logout,clear,restore,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},get status(){return status;},get ready(){return restoring??Promise.resolve();},get user(){return user;},get epoch(){return epoch;},get authenticated(){return !!token&&Date.now()/1000<expiresAt;}};
}
