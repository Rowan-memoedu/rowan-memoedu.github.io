import {createLocalUpdates} from './local-updates.mjs';
import {createCollaborationClient} from './client.mjs';
import {createNodeStates} from './node-states.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const visible=element=>element.isConnected&&!element.closest('[hidden],[inert]')&&element.getClientRects().length>0;
const nodeId=element=>element.id.replace(/^node-/u,'');

export function attachCollaboration(session,{window:win=window,loadUI=()=>import('./panels.tsx')}={}){
  const doc=win.document;
  const localUpdates=createLocalUpdates(win);
  const nodeStates=createNodeStates(win);let latestNodeStates=[];
  let UI=null,uiPromise=null,api=null,user=null,timer=null,pendingTimer=null,epoch=0,observer=null,refreshing=null,startError=null,scanQueued=null;
  let inbox={items:[],unreadCount:0,version:0,nextOffset:null},index={},noticeError='',bell=null,bellHost=null;
  const anchors=new Map(),savers=new Set(),restored=new Set(),nativeViews=new Map();
  const cancelled=()=>Object.assign(Error('登录状态已改变'),{name:'AbortError'});
  function clear(){
    epoch++;scanQueued=null;user=null;api=null;win.clearInterval(timer);timer=null;win.clearTimeout(pendingTimer);pendingTimer=null;observer?.disconnect();observer=null;refreshing=null;
    startError?.remove();startError=null;
    bell?.dispose();bell=null;bellHost?.remove();bellHost=null;
    for(const a of anchors.values()){win.clearTimeout(a.syncTimer);a.actions?.dispose();a.group?.dispose();a.editGroup?.dispose();a.actionHost?.remove();a.groupHost?.remove();a.editHost?.remove();restoreNative(a);cleanContainer(a);}
    anchors.clear();savers.clear();restored.clear();index={};inbox={items:[],unreadCount:0,version:0,nextOffset:null};
    nodeStates.clear();latestNodeStates=[];
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
  win.addEventListener('personal-todo-toggle',async event=>{
    if(!api||!session.authenticated)return;
    const {nodeId,todoState}=event.detail??{},node=doc.getElementById('node-'+nodeId);
    if(!node||node.dataset.todoEditable!=='true')return;
    try{await api.post('todos',{requestId:crypto.randomUUID(),anchorId:nodeId,todoState,expectedTodoState:node.dataset.todoState||null});await poll();}
    catch(error){noticeError=error.message;renderBell();const message=doc.createElement('span');message.setAttribute('role','status');message.className='collaboration-error';message.dataset.collaborationPrivate='';message.textContent=error.message;node.querySelector(':scope > .node-content')?.append(message);}
  });
  async function flushAll(){for(const save of savers)if(!await save())return false;return true;}
  function renderBell(){
    if(!bell||!api)return;
    bell.update({inbox,error:noticeError,onOpen:()=>poll(),onJump:jump,onMore:async()=>{
      try{const next=await api.get('inbox?offset='+inbox.nextOffset);const unique=new Map([...inbox.items,...next.items].map(n=>[n.id,n]));inbox={...next,items:[...unique.values()]};renderBell();}catch(e){noticeError=e.message;renderBell();}
    }});
  }
  function actionProps(a){return {api,anchorId:a.id,entry:index[a.id],data:a.data,canEdit:a.data?.canEdit??a.canEdit,onPermissions:a.node.dataset.documentAccess==='internal'&&['document','dailyDocument'].includes(a.node.dataset.remType)&&user?.role!=='reader'?()=>session.openPermissions?.(a.id):undefined,onEdit:()=>add(a,'outline'),onOpen:()=>load(a),refresh:()=>load(a,true),openKey:a.openKey,highlight:a.target?.sourceId};}
  function groupProps(a){return {api,anchorId:a.id,data:a.data,commentCounts:index,refresh:()=>load(a,true),onAccepted:proposal=>restore(a,proposal),onPermissions:user?.role!=='reader'?id=>session.openPermissions?.(id):undefined,registerSave,notificationTarget:a.target,nativeMarkup:a.nativeMarkup,nativeMetadata:a.nativeMetadata,titleClasses:[...((a.editNode??a.node).querySelector(':scope > .node-content')?.classList??[])].filter(c=>c.startsWith('document-title')).join(' ')};}
  function render(a){
    if(!a.node.isConnected)return;
    if(a.data?.proposals.some(p=>p.status==='adopting')&&doc.visibilityState!=='hidden'){
      a.syncTimer??=win.setTimeout(()=>{a.syncTimer=null;if(api&&a.node.isConnected)void load(a).catch(()=>{});},1200);
    }else{win.clearTimeout(a.syncTimer);a.syncTimer=null;}
    a.actions.update(actionProps(a));
    if(a.data?.proposals.some(p=>!['edit','outline'].includes(p.kind))){
      if(!a.group){
        let container=a.node.querySelector(':scope > .document-body')??a.node.querySelector(':scope > ul');
        if(!container){container=doc.createElement('ul');container.dataset.collaborationContainer='';a.node.append(container);}
        const host=doc.createElement(container.tagName==='UL'?'li':'div');host.className='collaboration-ui collaboration-proposals';host.dataset.collaborationPrivate='';
        container.prepend(host);a.groupHost=host;a.group=UI.mount(host,UI.ProposalGroup,groupProps(a));
        win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:[a.node.id]}}));
      }else a.group.update(groupProps(a));
    }else if(a.group){a.group.dispose();a.groupHost.remove();a.group=null;a.groupHost=null;cleanContainer(a);}
    if(a.data?.proposals.some(p=>['edit','outline'].includes(p.kind)&&['draft','adopting'].includes(p.status))){
      const outline=a.data.proposals.find(p=>p.kind==='outline'&&['draft','adopting'].includes(p.status))?.outline;
      if(a.editGroup&&a.editOutline!==!!outline){a.editGroup.dispose();a.editHost.remove();a.editGroup=null;a.editHost=null;restoreNative(a);}
      if(!a.editGroup){
        a.editOutline=!!outline;
        // The document is a validation context, never the editor's mount point.
        a.editNode=a.node;
        if(!a.editNode)return;
        a.nativeMarkup={};a.nativeMetadata={};
        const context=outline?doc.getElementById('node-'+outline.documentId):a.node;
        for(const node of [context,...context.querySelectorAll('.outline-node[id^="node-r-"]')]){
          const source=node.querySelector(':scope > .node-content');if(!source)continue;
          const cloned=source.cloneNode(true);cloned.querySelectorAll('.collaboration-ui').forEach(el=>el.remove());a.nativeMarkup[nodeId(node)]=cloned.innerHTML;
          const annotation=node.querySelector(':scope > .document-body > .document-annotations > .callout-label')?.cloneNode(true);annotation?.querySelectorAll('button').forEach(el=>el.remove());
          const control=node.querySelector(':scope > .outline-controls .node-focus');
          a.nativeMetadata[nodeId(node)]={parentReference:node.dataset.parentReference??null,remType:node.dataset.remType,documentAccess:node.dataset.documentAccess,listNumber:node.dataset.listNumber,focusLabel:control?.textContent,bulletColor:control&&win.getComputedStyle(control,'::before').backgroundColor,annotationHeader:annotation?.innerHTML,folded:node.classList.contains('is-folded'),sourceCallout:node.dataset.sourceCallout==='true',calloutType:node.dataset.sourceCalloutType,calloutLabel:node.dataset.sourceCalloutLabel};
        }
        const content=a.editNode.querySelector(':scope > .node-content');
        a.editNode.dataset.collaborationEditing='true';
        let view=nativeViews.get(a.editNode);
        if(!view){view={users:new Set(),native:[content,a.editNode.querySelector(':scope > .outline-controls'),...(outline?[...a.editNode.children].filter(el=>el.matches('ul,.document-body')):[])].filter(Boolean).map(el=>({el,hidden:el.hidden}))};nativeViews.set(a.editNode,view);}
        view.users.add(a);a.nativeView=view;view.native.forEach(({el})=>{el.hidden=true;});
        if(outline)a.editNode.dataset.collaborationContext=a.id;
        const host=doc.createElement('div');host.className='collaboration-ui collaboration-edit-host';host.dataset.collaborationPrivate='';
        host.dataset.nodeContext=a.id;
        content.before(host);a.editHost=host;a.editGroup=UI.mount(host,UI.ProposalGroup,{...groupProps(a),edit:true});
      }else a.editGroup.update({...groupProps(a),edit:true});
    }else if(a.editGroup){a.editGroup.dispose();a.editHost.remove();a.editGroup=null;a.editHost=null;restoreNative(a);doc.querySelector('.reading-outline')?.personalOutlineRefresh?.();}
  }
  function restoreNative(a){const node=a.editNode??a.node,view=a.nativeView;if(view){view.users.delete(a);if(!view.users.size){view.native.forEach(({el,hidden})=>{el.hidden=hidden;});nativeViews.delete(node);delete node.dataset.collaborationEditing;delete node.dataset.collaborationContext;}}a.nativeView=null;a.editNode=null;}
  function cleanContainer(a){const container=a.node.querySelector(':scope > [data-collaboration-container]');if(container&&!container.children.length){container.remove();win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:[a.node.id]}}));}}
  async function load(a,refresh=false){
    if(a.loading){await a.loading;if(!refresh)return a.data;}
    const generation=epoch;
    a.loading=(async()=>{
      try{const data=await api.get('anchors/'+a.id);if(generation!==epoch||!a.node.isConnected)return;
        const revision=JSON.stringify(data);if(a.dataRevision===revision)return;
        a.dataRevision=revision;a.data=data;render(a);localUpdates.apply(a.id,data.localUpdates??[]);nodeStates.apply(latestNodeStates);}
      catch(error){if(generation===epoch&&[401,403,404].includes(error.status)){localUpdates.remove(a.id);a.data=null;render(a);}throw error;}
    })();
    try{await a.loading;if(refresh)void poll();return a.data;}finally{a.loading=null;}
  }
  async function add(a,mode='outline'){
    await api.post('proposals',{requestId:crypto.randomUUID(),anchorId:a.id,mode});await load(a,true);
    // Editing starts at the selected line without changing the reader route.
    for(let i=0;i<20;i++){const line=a.editHost?.querySelector('[data-contribution-node="'+a.id+'"]');if(line){line.click();break;}await delay(40);}
  }
  function scheduleScan(){
    if(scanQueued)return;
    const ticket={generation:epoch};scanQueued=ticket;
    queueMicrotask(()=>{if(scanQueued!==ticket)return;scanQueued=null;if(ticket.generation===epoch)scan();});
  }
  function sourceChanged(records){
    // React, Slate and media controls change their own DOM. They are not new
    // source nodes and must not feed an update back into every React root.
    return records.some(record=>!record.target.closest?.('.collaboration-ui,[data-collaboration-private]')&&
      [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&
        (node.matches('.outline-node,.node-content')||node.querySelector('.outline-node,.node-content'))));
  }
  function scan(){
    if(!api||!UI)return;
    for(const [id,a] of anchors)if(!a.node.isConnected){win.clearTimeout(a.syncTimer);a.actions.dispose();a.group?.dispose();a.editGroup?.dispose();restoreNative(a);anchors.delete(id);}
    for(const node of doc.querySelectorAll('.reading-outline .outline-node[id^="node-r-"]')){
      if(user?.role==='reader'){
        if(node.closest('[data-publication-state]'))continue;
      }
      if(node.dataset.localSynced==='true'||node.dataset.layoutOnly==='true'||node.closest('[data-content-state="unavailable"]'))continue;
      const id=nodeId(node);let a=anchors.get(id);
      if(!a){
        // Folded source branches are ordinary dormant content, not hundreds of
        // mounted React editors. The same focus/expand event activates them.
        if(node.closest('[hidden],[inert]'))continue;
        a=ensureAnchor(node);if(!a)continue;
      }
      const state=JSON.stringify([index[id]??null,user?.id,user?.name,user?.owner,user?.role]);
      if(a.renderState!==state){a.renderState=state;render(a);}
      if(index[id]?.proposals&&visible(node)&&!a.data&&!a.loading)void load(a).catch(()=>{});
    }
  }
  function ensureAnchor(node){
    const id=nodeId(node);let a=anchors.get(id);if(a)return a;
    const content=node.querySelector(':scope > .node-content');if(!content)return;
    const host=doc.createElement('span');host.className='collaboration-ui collaboration-actions';host.dataset.collaborationPrivate='';content.append(host);
    const document=node.closest('[data-rem-type="document"],[data-rem-type="dailyDocument"]');
    a={id,node,actionHost:host,canEdit:user?.role!=='reader'||document?.dataset.readerEditable==='true'};a.actions=UI.mount(host,UI.Actions,actionProps(a));anchors.set(id,a);return a;
  }
  async function restore(a,proposal){
    const restoredId=proposal.operation?.id??proposal.id;
    if(restored.has(restoredId)||a.target?.proposalId===proposal.id)return;
    restored.add(restoredId);
    try{
      const generation=epoch,authentication=session.epoch;
      if(!await flushAll()){restored.delete(restoredId);return;}
      if(generation!==epoch||authentication!==session.epoch||!a.node.isConnected)return;
      await session.content.refreshNode('node-'+a.id,{beforePublish:()=>localUpdates.remove(a.id)});scan();
    }catch(e){restored.delete(restoredId);noticeError=e.message;renderBell();}
  }
  async function poll(){
    if(!api||refreshing===epoch)return;const generation=epoch;refreshing=generation;
    try{
      const [state,list,counts]=await Promise.all([api.get('session'),api.get('inbox'),api.get('index')]);
      if(generation!==epoch)return;
      user=state;api.user=state;
      if(list.version>=inbox.version) {
        // Revalidate every loaded history page when the inbox changes; never
        // retain stale rows whose document permissions may have been revoked.
        const depth=inbox.items.length;
        let next=list;
        while(next.nextOffset!==null&&next.items.length<depth){
          const page=await api.get('inbox?offset='+next.nextOffset);
          if(generation!==epoch)return;
          next={...page,items:[...next.items,...page.items]};
        }
        inbox=next;
      }
      index=counts.entries;latestNodeStates=counts.nodeStates??[];nodeStates.apply(latestNodeStates);noticeError='';renderBell();scan();
      win.clearTimeout(pendingTimer);pendingTimer=null;
      if(latestNodeStates.some(state=>['queued','retry'].includes(state.syncStatus)))pendingTimer=win.setTimeout(()=>{pendingTimer=null;if(generation===epoch)void poll();},1500);
      for(const a of anchors.values())if(a.data&&(visible(a.node)||a.editHost&&visible(a.editHost)))void load(a).catch(()=>{});
      if(doc.querySelector('[data-recent-changes]'))await recentChanges();
    }catch(e){if(generation===epoch&&e.name!=='AbortError'){noticeError=e.message;renderBell();}}finally{if(refreshing===generation)refreshing=null;}
  }
  async function jump(notice){
    await session.ready;
    if(!api||!session.authenticated)throw cancelled();
    const generation=epoch,authentication=session.epoch;
    await session.open?.(notice.anchorId);
    if(generation!==epoch||authentication!==session.epoch)throw cancelled();
    let target=doc.getElementById('node-'+notice.anchorId);
    if(!target){
      // A different full-page document restores and validates the remembered session.
      win.location.href='/blog/?notification='+encodeURIComponent(notice.id)+'#node-'+notice.documentId;return;
    }
    win.location.hash='node-'+notice.anchorId;
    // Outline navigation runs on hashchange. Let it reveal the ordinary
    // ancestors before mounting actions, without expanding unrelated branches.
    await delay(0);await session.ready;
    if(generation!==epoch||authentication!==session.epoch)throw cancelled();
    scan();
    const a=anchors.get(notice.anchorId);if(!a)throw Error('请先进入并加载该文档');
    a.target=notice;await load(a);
    if(generation!==epoch||authentication!==session.epoch)throw cancelled();
    const insideProposal=notice.proposalId&&a.data.proposals.some(p=>p.id===notice.proposalId);
    if(!insideProposal&&!notice.sourceId.startsWith('node:'))a.openKey=Date.now();
    render(a);
    const wanted=notice.sourceId.startsWith('node:')?notice.sourceId.split(':').at(-1):null;
    for(let attempt=0;attempt<40;attempt++){
      if(generation!==epoch||authentication!==session.epoch)throw cancelled();
      const element=notice.targetNodeId?doc.getElementById('node-'+notice.targetNodeId):wanted?[...doc.querySelectorAll('[data-contribution-node]')].find(el=>el.dataset.contributionNode===wanted):doc.getElementById('collab-'+notice.sourceId);
      if(element&&visible(element)){
        element.scrollIntoView({block:'center'});element.setAttribute('tabindex','-1');element.focus({preventScroll:true});element.dataset.highlight='true';
        const read=await api.post('inbox/read',{notificationId:notice.id});
        if(read.deletedMessageId)await load(a,true);
        void poll();return;
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
      await session.ready;if(generation!==epoch||!session.authenticated)return;
      uiPromise??=loadUI().catch(error=>{uiPromise=null;throw error;});UI??=await uiPromise;if(generation!==epoch)return;
      api=createCollaborationClient(session,{guard:()=>{if(generation!==epoch)throw cancelled();}});user=await api.get('session');api.user=user;
      bellHost=doc.createElement('span');bellHost.className='collaboration-ui';(doc.querySelector('.site-header-inner')??doc.body).append(bellHost);
      bell=UI.mount(bellHost,UI.Bell,{inbox,onOpen:()=>poll(),onJump:jump,onMore:()=>{}});
      observer=new win.MutationObserver(records=>{if(sourceChanged(records))scheduleScan();});const root=doc.querySelector('.reading-outline');if(root)observer.observe(root,{childList:true,subtree:true});
      scan();await poll();if(generation!==epoch)return;
      timer=win.setInterval(()=>{if(doc.visibilityState!=='hidden')void poll();},15000);
      const notification=new URL(win.location.href).searchParams.get('notification');
      if(notification){const notice=inbox.items.find(n=>n.id===notification)??await api.get('inbox/'+encodeURIComponent(notification));await jump(notice);}
    }catch(e){if(generation===epoch&&e.name!=='AbortError'){
      noticeError=e.message;renderBell();
      if(!bell){
        startError=doc.createElement('button');startError.type='button';startError.dataset.collaborationPrivate='';startError.textContent='协作加载失败，点击重试';startError.title=e.message;
        startError.onclick=()=>void start();(doc.querySelector('.site-header-inner')??doc.body).append(startError);
      }
    }}
  }
  win.addEventListener('personal-session-changed',()=>void start());
  win.addEventListener('personal-access-changing',clear);
  win.addEventListener('personal-access-changed',()=>void start());
  win.addEventListener('personal-outline-changed',scheduleScan);
  win.addEventListener('personal-outline-focus-changed',scheduleScan);
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible'){if(session.authenticated&&!api)void start();else void poll();}});
  win.addEventListener('pagehide',clear);
  win.addEventListener('beforeunload',event=>{if([...doc.querySelectorAll('[data-proposal-id] [role=status]')].some(el=>/未保存|正在保存|保存失败|另一方/.test(el.textContent))){event.preventDefault();event.returnValue='';}});
  if(session.authenticated)void start();return {clear,poll};
}
