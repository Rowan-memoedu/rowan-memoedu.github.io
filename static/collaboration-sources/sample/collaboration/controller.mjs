import DOMPurify from 'dompurify';
import {createLocalUpdates} from './local-updates.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const visible=element=>element.isConnected&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0;
const nodeId=element=>element.id.replace(/^node-/u,'');

export function attachCollaboration(session,{window:win=window,loadUI=()=>import('./panels.tsx')}={}){
  const doc=win.document;
  const localUpdates=createLocalUpdates(win);
  let UI=null,uiPromise=null,api=null,user=null,timer=null,epoch=0,observer=null,refreshing=null,startError=null;
  let inbox={items:[],unreadCount:0,version:0,nextOffset:null},index={},noticeError='',bell=null,bellHost=null;
  const anchors=new Map(),savers=new Set(),restored=new Set();
  const cancelled=()=>Object.assign(Error('登录状态已改变'),{name:'AbortError'});
  function clear(){
    epoch++;user=null;api=null;win.clearInterval(timer);timer=null;observer?.disconnect();observer=null;refreshing=null;
    startError?.remove();startError=null;
    bell?.dispose();bell=null;bellHost?.remove();bellHost=null;
    for(const a of anchors.values()){win.clearTimeout(a.syncTimer);a.actions?.dispose();a.group?.dispose();a.editGroup?.dispose();a.actionHost?.remove();a.groupHost?.remove();a.editHost?.remove();restoreNative(a);cleanContainer(a);}
    anchors.clear();savers.clear();restored.clear();index={};inbox={items:[],unreadCount:0,version:0,nextOffset:null};
    localUpdates.clear();
    for(const el of doc.querySelectorAll('[data-collaboration-private]'))el.remove();
  }
  async function request(route,body){
    const generation=epoch,authentication=session.epoch;
    if(!session.authenticated)throw cancelled();
    const result=await(await session.request('/collaboration/'+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})).json();
    if(generation!==epoch||authentication!==session.epoch)throw cancelled();
    return result;
  }
  const registerSave=save=>{savers.add(save);return()=>savers.delete(save);};
  async function flushAll(){for(const save of savers)if(!await save())return false;return true;}
  function renderBell(){
    if(!bell||!api)return;
    bell.update({inbox,error:noticeError,onOpen:()=>void poll(),onJump:jump,onMore:async()=>{
      try{const next=await api.get('inbox?offset='+inbox.nextOffset);const unique=new Map([...inbox.items,...next.items].map(n=>[n.id,n]));inbox={...next,items:[...unique.values()]};renderBell();}catch(e){noticeError=e.message;renderBell();}
    }});
  }
  function actionProps(a){return {api,anchorId:a.id,entry:index[a.id],data:a.data,onAdd:()=>add(a),onEdit:()=>add(a,'edit'),onOpen:()=>load(a),refresh:()=>load(a,true),openKey:a.openKey,highlight:a.target?.sourceId};}
  function groupProps(a){return {api,anchorId:a.id,data:a.data,refresh:()=>load(a,true),onAccepted:proposal=>restore(a,proposal),registerSave,notificationTarget:a.target};}
  function render(a){
    if(!a.node.isConnected)return;
    if(a.data?.proposals.some(p=>p.status==='adopting')&&doc.visibilityState!=='hidden'){
      a.syncTimer??=win.setTimeout(()=>{a.syncTimer=null;if(api&&a.node.isConnected)void load(a).catch(()=>{});},1200);
    }else{win.clearTimeout(a.syncTimer);a.syncTimer=null;}
    a.actions.update(actionProps(a));
    if(a.data?.proposals.some(p=>p.kind!=='edit')){
      if(!a.group){
        let container=a.node.querySelector(':scope > .document-body')??a.node.querySelector(':scope > ul');
        if(!container){container=doc.createElement('ul');container.dataset.collaborationContainer='';a.node.append(container);}
        const host=doc.createElement(container.tagName==='UL'?'li':'div');host.className='collaboration-ui collaboration-proposals';host.dataset.collaborationPrivate='';
        container.prepend(host);a.groupHost=host;a.group=UI.mount(host,UI.ProposalGroup,groupProps(a));
        win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:[a.node.id]}}));
      }else a.group.update(groupProps(a));
    }else if(a.group){a.group.dispose();a.groupHost.remove();a.group=null;a.groupHost=null;cleanContainer(a);}
    if(a.data?.proposals.some(p=>p.kind==='edit')){
      if(!a.editGroup){
        const content=a.node.querySelector(':scope > .node-content');
        a.node.dataset.collaborationEditing='true';
        a.native=[content,a.node.querySelector(':scope > .outline-controls')].filter(Boolean).map(el=>({el,hidden:el.hidden}));
        a.native.forEach(({el})=>{el.hidden=true;});
        const host=doc.createElement('div');host.className='collaboration-ui collaboration-edit-host';host.dataset.collaborationPrivate='';
        content.before(host);a.editHost=host;a.editGroup=UI.mount(host,UI.ProposalGroup,{...groupProps(a),edit:true});
      }else a.editGroup.update({...groupProps(a),edit:true});
    }else if(a.editGroup){a.editGroup.dispose();a.editHost.remove();a.editGroup=null;a.editHost=null;restoreNative(a);}
  }
  function restoreNative(a){a.native?.forEach(({el,hidden})=>{el.hidden=hidden;});a.native=null;delete a.node.dataset.collaborationEditing;}
  function cleanContainer(a){const container=a.node.querySelector(':scope > [data-collaboration-container]');if(container&&!container.children.length){container.remove();win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:[a.node.id]}}));}}
  async function load(a,refresh=false){
    if(a.loading){await a.loading;return a.data;}
    const generation=epoch;
    a.loading=(async()=>{
      try{const data=await api.get('anchors/'+a.id);if(generation!==epoch||!a.node.isConnected)return; a.data=data;render(a);localUpdates.apply(a.id,data.localUpdates??[]);}
      catch(error){if(generation===epoch&&[401,403,404].includes(error.status)){localUpdates.remove(a.id);a.data=null;render(a);}throw error;}
    })();
    try{await a.loading;if(refresh)void poll();return a.data;}finally{a.loading=null;}
  }
  async function add(a,mode='add'){
    await api.post('proposals',{requestId:crypto.randomUUID(),anchorId:a.id,...(mode==='edit'?{mode}:{})});await load(a,true);
    // Wait for React to commit before moving focus to the empty new child.
    for(let i=0;i<20;i++){const fields=(mode==='edit'?a.editHost:a.groupHost)?.querySelectorAll('[contenteditable=true]');if(fields?.length){fields[fields.length-1].focus();break;}await delay(40);}
  }
  function scan(){
    if(!api||!UI)return;
    for(const [id,a] of anchors)if(!a.node.isConnected){win.clearTimeout(a.syncTimer);a.actions.dispose();a.group?.dispose();a.editGroup?.dispose();restoreNative(a);anchors.delete(id);}
    for(const node of doc.querySelectorAll('.reading-outline .outline-node[id^="node-r-"]')){
      if(node.dataset.localSynced==='true'||node.dataset.layoutOnly==='true'||(node.dataset.publicationState==='protected'&&node.dataset.privateLoaded!=='true'))continue;
      const id=nodeId(node);let a=anchors.get(id);
      if(!a){
        const content=node.querySelector(':scope > .node-content');if(!content)continue;
        const host=doc.createElement('span');host.className='collaboration-ui collaboration-actions';host.dataset.collaborationPrivate='';content.append(host);
        a={id,node,actionHost:host};a.actions=UI.mount(host,UI.Actions,actionProps(a));anchors.set(id,a);
      }
      render(a);
      if(index[id]?.proposals&&visible(node)&&!a.data&&!a.loading)void load(a).catch(()=>{});
    }
  }
  async function restore(a,proposal){
    const restoredId=proposal.operation?.id??proposal.id;
    if(restored.has(restoredId)||a.target?.proposalId===proposal.id)return;
    restored.add(restoredId);
    try{
      const generation=epoch,authentication=session.epoch;
      if(!await flushAll()){restored.delete(restoredId);return;}
      // Reload only this canonical source branch using the shared authenticated session.
      const documentNode=a.node.closest('[data-rem-type="document"],[data-rem-type="dailyDocument"]');
      const privateDocument=documentNode?.dataset.privateLoaded==='true';
      const raw=privateDocument?(await(await session.request('/documents/'+nodeId(documentNode))).json()).html:await(await fetch('/blog/',{cache:'no-store',credentials:'omit'})).text();
      if(generation!==epoch||authentication!==session.epoch||!a.node.isConnected)return;
      localUpdates.remove(a.id);
      const parsed=new win.DOMParser().parseFromString(DOMPurify.sanitize(raw,{FORBID_TAGS:['script','iframe','object','embed','form','input']}),'text/html');
      const replacement=parsed.getElementById('node-'+a.id);if(!replacement)throw Error('正式节点尚未出现在当前页面');
      if(privateDocument){
        // Existing authorized assets are memory-only blob URLs. Preserve them.
        for(const asset of replacement.querySelectorAll('[data-private-asset]')){
          const original=[...a.node.querySelectorAll('[data-private-asset]')].find(x=>x.dataset.privateAsset===asset.dataset.privateAsset);
          const field=asset.tagName==='IMG'?'src':'href';const value=original?.getAttribute(field);if(value)asset.setAttribute(field,value);
        }
        if(documentNode===a.node){replacement.dataset.privateLoaded='true';replacement.dataset.publicationState='protected';}
      }
      a.node.replaceWith(doc.importNode(replacement,true));win.dispatchEvent(new win.CustomEvent('personal-outline-changed'));scan();
    }catch(e){restored.delete(restoredId);noticeError=e.message;renderBell();}
  }
  async function poll(){
    if(!api||refreshing===epoch)return;const generation=epoch;refreshing=generation;
    try{
      const [state,list,counts]=await Promise.all([api.get('session'),api.get('inbox'),api.get('index')]);
      if(generation!==epoch)return;
      user=state;api.user=state;
      if(list.version>=inbox.version)inbox=list;
      index=counts.entries;noticeError='';renderBell();scan();
      for(const a of anchors.values())if(a.data&&visible(a.node))void load(a).catch(()=>{});
      if(doc.querySelector('[data-recent-changes]'))await recentChanges();
    }catch(e){if(generation===epoch&&e.name!=='AbortError'){noticeError=e.message;renderBell();}}finally{if(refreshing===generation)refreshing=null;}
  }
  async function jump(notice){
    let target=doc.getElementById('node-'+notice.anchorId);
    if(!target){
      const protectedRoot=doc.getElementById('node-'+notice.documentId);
      if(protectedRoot?.dataset.publicationState==='protected'){
        win.location.hash='node-'+notice.documentId;await session.open(notice.documentId);target=doc.getElementById('node-'+notice.anchorId);
      }
    }
    if(!target){
      // A different full-page document restores and validates the remembered session.
      win.location.href='/blog/?notification='+encodeURIComponent(notice.id)+'#node-'+notice.documentId;return;
    }
    win.location.hash='node-'+notice.anchorId;scan();
    const a=anchors.get(notice.anchorId);if(!a)throw Error('请先进入并加载该文档');
    a.target=notice;await load(a);
    const insideProposal=notice.proposalId&&a.data.proposals.some(p=>p.id===notice.proposalId);
    if(!insideProposal&&!notice.sourceId.startsWith('node:'))a.openKey=Date.now();
    render(a);
    const wanted=notice.sourceId.startsWith('node:')?notice.sourceId.split(':').at(-1):null;
    for(let attempt=0;attempt<40;attempt++){
      const element=notice.targetNodeId?doc.getElementById('node-'+notice.targetNodeId):wanted?[...doc.querySelectorAll('[data-contribution-node]')].find(el=>el.dataset.contributionNode===wanted):doc.getElementById('collab-'+notice.sourceId);
      if(element&&visible(element)){
        element.scrollIntoView({block:'center'});element.setAttribute('tabindex','-1');element.focus({preventScroll:true});element.dataset.highlight='true';
        await api.post('inbox/read',{notificationId:notice.id});void poll();return;
      }
      await delay(50);
    }
    throw Error('消息目标暂不可见，未标记已读');
  }
  async function recentChanges(){
    const feed=doc.querySelector('[data-recent-changes]');if(!feed)return;
    const result=await api.get('activity');
    const previous=doc.querySelector('[data-collaboration-activity]');const section=doc.createElement('div');section.className='mw-changeslist';section.dataset.collaborationActivity='';section.dataset.collaborationPrivate='';
    const heading=doc.createElement('p');heading.textContent='与你有关的协作记录（私密）';section.append(heading);
    let lastDate='',list;const labels={edit:'编辑了待采纳内容',comment:'添加了批注',reply:'回复了批注',synced:'已同步到 RemNote，等待发布',accepted:'已发布采纳内容'};
    for(const e of result.items){
      const day=new Date(e.createdAt*1000).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'});
      if(day!==lastDate){const h=doc.createElement('h4');h.textContent=day;section.append(h);list=doc.createElement('ul');list.className='special';section.append(list);lastDate=day;}
      const li=doc.createElement('li');li.className='mw-changeslist-line mw-changeslist-line-not-watched';const span=doc.createElement('span');span.className='mw-changeslist-line-inner';
      const link=doc.createElement('a');link.className='mw-changeslist-title';link.href='/blog/#node-'+e.documentId;link.textContent=labels[e.kind]??'协作记录';
      const time=doc.createElement('time');time.className='mw-changeslist-time';time.textContent=new Date(e.createdAt*1000).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'});
      const author=doc.createElement('span');author.className='comment';author.textContent='（'+e.actorName+'）';span.append(link,'；',time,' ',author);li.append(span);list.append(li);
    }
    previous?previous.replaceWith(section):feed.before(section);
  }
  async function start(){
    if(!session.authenticated){clear();return;}
    clear();const generation=epoch;
    try{
      uiPromise??=loadUI().catch(error=>{uiPromise=null;throw error;});UI??=await uiPromise;if(generation!==epoch)return;
      user=await request('session');api={user,get:route=>request(route),post:request,users:context=>request('mentions?'+new URLSearchParams(Object.entries(context).filter(([,v])=>v!==undefined)))};
      bellHost=doc.createElement('span');bellHost.className='collaboration-ui';(doc.querySelector('.site-header-inner')??doc.body).append(bellHost);
      bell=UI.mount(bellHost,UI.Bell,{inbox,onOpen:()=>void poll(),onJump:jump,onMore:()=>{}});
      observer=new win.MutationObserver(()=>queueMicrotask(scan));const root=doc.querySelector('.reading-outline');if(root)observer.observe(root,{childList:true,subtree:true});
      scan();await poll();if(generation!==epoch)return;
      timer=win.setInterval(()=>{if(doc.visibilityState!=='hidden')void poll();},15000);
      const notification=new URL(win.location.href).searchParams.get('notification');
      if(notification){const notice=inbox.items.find(n=>n.id===notification);if(notice)await jump(notice);}
    }catch(e){if(generation===epoch&&e.name!=='AbortError'){
      noticeError=e.message;renderBell();
      if(!bell){
        startError=doc.createElement('button');startError.type='button';startError.dataset.collaborationPrivate='';startError.textContent='协作加载失败，点击重试';startError.title=e.message;
        startError.onclick=()=>void start();(doc.querySelector('.site-header-inner')??doc.body).append(startError);
      }
    }}
  }
  win.addEventListener('personal-session-changed',()=>void start());
  win.addEventListener('personal-outline-changed',()=>queueMicrotask(scan));
  win.addEventListener('personal-outline-focus-changed',()=>queueMicrotask(scan));
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible'){if(session.authenticated&&!api)void start();else void poll();}});
  win.addEventListener('pagehide',clear);
  win.addEventListener('beforeunload',event=>{if([...doc.querySelectorAll('[data-proposal-id] [role=status]')].some(el=>/未保存|正在保存|保存失败|另一方/.test(el.textContent))){event.preventDefault();event.returnValue='';}});
  if(session.authenticated)void start();return {clear,poll};
}
