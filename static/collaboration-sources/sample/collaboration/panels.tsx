/* MIT. Data-bound adaptations of Plate block-discussion/comment and Echo items.
 * No mock discussion store or browser persistence. See upstream manifests. */
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MessageSquareTextIcon,PlusIcon,PencilIcon,ArrowUpIcon,BellIcon,CheckIcon,XIcon} from 'lucide-react';
import {Button} from '../upstream/collaboration/plate/components/ui/button';
import {Avatar,AvatarFallback} from '../upstream/collaboration/plate/components/ui/avatar';
import {Popover,PopoverContent,PopoverTrigger} from './popover';
import {RichEditor} from './editor';
import {Autosave,textOf} from './model.mjs';
const date=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value*1000));
const blank=[{text:''}];
const statusText={saved:'已保存',unsaved:'未保存',saving:'正在保存…',error:'保存失败，可重试',conflict:'另一方已修改，请对照两个版本后继续'};

function Composer({api,anchorId,thread,proposalId,proposalNodeId,replyTo,onSent,onCancel}:any){
  const [runs,setRuns]=useState(blank),[users,setUsers]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[key,setKey]=useState(0);
  const pending=useRef<any>(null);
  useEffect(()=>{let alive=true;api.users({anchorId,threadId:thread?.id,proposalId}).then((x:any)=>{if(alive)setUsers(x.users);}).catch((e:any)=>{if(alive)setError(e.message);});return()=>{alive=false;};},[thread?.id,proposalId,anchorId]);
  async function submit(){
    setBusy(true);setError('');
    try{
      const body={anchorId,content:runs,...(thread?{threadId:thread.id,replyTo:replyTo??thread.messages.at(-1).id}:proposalId?{proposalId,proposalNodeId}:{})};
      const fingerprint=JSON.stringify(body);
      if(!pending.current||pending.current.fingerprint!==fingerprint)pending.current={fingerprint,requestId:crypto.randomUUID()};
      await api.post('messages',{...body,requestId:pending.current.requestId});
      pending.current=null;setRuns(blank);setKey(x=>x+1);await onSent();
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <div className="collaboration-composer"><Avatar className="size-6"><AvatarFallback>{api.user.name[0]}</AvatarFallback></Avatar>
    <div className="collaboration-composer-field"><RichEditor key={key} initial={blank} users={users} onChange={setRuns} readOnly={busy} onSubmit={()=>{if(!busy&&textOf(runs).trim())void submit();}} label={thread?'回复编辑器':'批注编辑器'} placeholder={thread?'回复，@ 提及对方…':'写下批注，@ 提及对方…'}/>
      <div className="collaboration-composer-footer"><span>Ctrl + Enter 发送</span>{onCancel&&<button type="button" onClick={onCancel}>取消</button>}<Button variant="ghost" size="icon-xs" aria-label="发送批注或回复" disabled={busy||!textOf(runs).trim()} onClick={()=>void submit()}><ArrowUpIcon className="size-4"/></Button></div>
      {error&&<p role="status" className="collaboration-error">{error}</p>}</div></div>;
}
function Message({message,thread,onReply,onDelete,highlight,children,composer}:any){
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const replied=thread.messages.find((m:any)=>m.id===message.replyTo);
  async function remove(){setBusy(true);setError('');try{await onDelete(message.id);setConfirm(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  return <article id={'collab-'+message.id} tabIndex={-1} className="collaboration-message" data-message-id={message.id} data-highlight={highlight===message.id}>
    <header><Avatar className="size-6"><AvatarFallback>{message.authorName[0]}</AvatarFallback></Avatar><strong>{message.authorName}</strong><time>{date(message.createdAt)}</time></header>
    {replied&&<div className="collaboration-reply-reference">回复 {replied.authorName}</div>}
    <div className="collaboration-message-body">{message.deleted?<p className="collaboration-deleted-message">此评论已删除</p>:<RichEditor initial={message.content} readOnly label="批注内容"/>}</div>
    {!message.deleted&&<><button className="collaboration-reply-button" type="button" onClick={()=>onReply(message.id)}>回复</button>{message.canDelete&&<button className="collaboration-reply-button" type="button" onClick={()=>setConfirm(true)}>删除</button>}</>}
    {confirm&&!message.deleted&&<div role="group" aria-label="删除评论确认"><span>删除这条评论？</span> <button type="button" disabled={busy} onClick={()=>void remove()}>确认删除</button> <button type="button" disabled={busy} onClick={()=>setConfirm(false)}>取消</button></div>}
    {error&&<p role="status" className="collaboration-error">{error}</p>}{!message.deleted&&composer}{children}
  </article>;
}
const originalThread=(data:any,t:any)=>!t.proposalId||!data.proposals.some((p:any)=>p.id===t.proposalId&&p.status!=='accepted');
export function DiscussionPanel({api,anchorId,data,proposalId,proposalNodeId,includeOriginal=false,refresh,highlight,onClose}:any){
  const threads=data.threads.filter((t:any)=>(proposalId?t.proposalId===proposalId&&t.proposalNodeId===proposalNodeId:originalThread(data,t))||(includeOriginal&&originalThread(data,t)));
  const [reply,setReply]=useState<string|null>(null);
  useEffect(()=>{if(!highlight)return;const el=document.getElementById('collab-'+highlight);el?.scrollIntoView({block:'center'});el?.focus({preventScroll:true});},[highlight,data]);
  function branch(thread:any,parent:string|null=null,depth=0):any{
    return thread.messages.filter((m:any)=>m.replyTo===parent||(!parent&&!thread.messages.some((x:any)=>x.id===m.replyTo))).map((message:any)=><Message key={message.id} thread={thread} message={message} highlight={highlight} onReply={setReply} onDelete={async(messageId:string)=>{await api.post('messages/delete',{requestId:crypto.randomUUID(),threadId:thread.id,messageId});if(reply===messageId)setReply(null);await refresh();}} composer={reply===message.id?<Composer api={api} anchorId={anchorId} thread={thread} replyTo={message.id} onCancel={()=>setReply(null)} onSent={async()=>{await refresh();setReply(null);}}/>:null}>
      {thread.messages.some((m:any)=>m.replyTo===message.id)&&<div className={'collaboration-replies '+(depth>=2?'collaboration-replies-flat':'')}>{branch(thread,message.id,depth+1)}</div>}
    </Message>);
  }
  return <section className="collaboration-discussion" aria-label="节点批注"><header className="collaboration-discussion-header"><div><strong>批注</strong><p>仅作者与站长可见</p></div>{onClose&&<button className="collaboration-action" type="button" aria-label="关闭批注" onClick={onClose}><XIcon/></button>}</header>
    <div className="collaboration-discussion-list">{!threads.length&&<p className="collaboration-empty">暂无批注</p>}{threads.map((thread:any)=><section className="collaboration-thread" key={thread.id} data-thread-id={thread.id}>{branch(thread)}</section>)}</div>
    <div className="collaboration-new-comment"><Composer api={api} anchorId={anchorId} proposalId={proposalId} proposalNodeId={proposalNodeId} onSent={refresh}/></div>
  </section>;
}

export function Actions({api,anchorId,entry,onAdd,onEdit,onOpen,openKey,data,refresh,highlight}:any){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(openKey)setOpen(true);},[openKey]);
  return <><Popover open={open} onOpenChange={value=>{setOpen(value);if(value)void onOpen().catch((e:any)=>setError(e.message));}}>
    <PopoverTrigger asChild><button type="button" className={'collaboration-action '+(entry?.comments?'collaboration-comment-existing':'collaboration-transient')} aria-label={entry?.comments?`查看 ${entry.comments} 条批注`:'添加批注'}><MessageSquareTextIcon/>{entry?.comments>0&&<span>{entry.comments}</span>}</button></PopoverTrigger>
    <PopoverContent className="collaboration-discussion-popover" side="bottom" align="end" onOpenAutoFocus={e=>e.preventDefault()}>
      {error?<p role="status" className="p-4">{error}</p>:data?<DiscussionPanel api={api} anchorId={anchorId} data={data} refresh={refresh} highlight={highlight} onClose={()=>setOpen(false)}/>:<p className="p-4" role="status">正在加载批注…</p>}
    </PopoverContent></Popover>
    <button type="button" className="collaboration-action collaboration-transient" aria-label="添加子节点" onClick={()=>void onAdd().catch((e:any)=>setError(e.message))}><PlusIcon/></button>
    <button type="button" className="collaboration-action collaboration-transient" aria-label="修改节点" onClick={()=>void onEdit().catch((e:any)=>setError(e.message))}><PencilIcon/></button>
    {error&&!open&&<span role="status" className="text-xs text-destructive">{error}</span>}</>;
}

function Proposal({api,proposal,anchorId,data,refresh,onAccepted,registerSave,notificationTarget}:any){
  const [state,setState]=useState('saved'),[error,setError]=useState(''),[users,setUsers]=useState([]),[preview,setPreview]=useState<any>(null),[commentNode,setCommentNode]=useState<string|null>(null),[remote,setRemote]=useState<any>(null),[version,setVersion]=useState(0);
  const current=useRef(proposal),initial=useRef(proposal.nodes),save=useRef<any>(null),latest=useRef(proposal),editor=useRef<any>(null),mounted=useRef(true);
  latest.current=proposal;
  const history=proposal.status==='accepted'&&notificationTarget?.proposalId===proposal.id;
  useEffect(()=>{if(notificationTarget?.proposalId===proposal.id&&notificationTarget.threadId){const t=data.threads.find((t:any)=>t.id===notificationTarget.threadId);if(t)setCommentNode(t.proposalNodeId);}},[notificationTarget?.id]);
  const startSave=(base:any)=>{save.current?.dispose();save.current=new Autosave({proposal:base,send:(body:any)=>api.post('proposals/save',body),onState:(status:string,e:any)=>{if(mounted.current){setState(status);if(e)setError(e.message);}},onSaved:(p:any)=>{current.current={...current.current,...p};}});};
  if(!save.current)startSave(proposal);
  useEffect(()=>{mounted.current=true;const unregister=registerSave(()=>save.current.flush());api.users({anchorId,proposalId:proposal.id}).then((x:any)=>{if(mounted.current)setUsers(x.users);}).catch((e:any)=>{if(mounted.current)setError(e.message);});return()=>{mounted.current=false;save.current.dispose();unregister();};},[]);
  useEffect(()=>{
    if(proposal.operation?.status==='accepted'){void onAccepted(proposal);if(proposal.status==='accepted')return;}
    if(proposal.revision<=current.current.revision)return;
    if(state==='saved'){current.current=proposal;initial.current=proposal.nodes;startSave(proposal);setVersion(v=>v+1);}
    else if(!save.current.running){save.current.conflict=true;setState('conflict');setRemote(proposal);}
  },[proposal.revision,proposal.status,proposal.operation?.status]);
  async function showPreview(nodeId:string){
    setError('');try{if(!await save.current.flush())return;const result=await api.get('proposals/'+proposal.id+'/preview?nodeId='+encodeURIComponent(nodeId));setPreview(result);}catch(e:any){setError(e.message);}
  }
  async function approve(){
    try{await api.post('approve',{requestId:crypto.randomUUID(),proposalId:proposal.id,nodeId:preview.nodeId,revision:preview.revision,projectionHash:preview.projectionHash});setPreview(null);await refresh();}catch(e:any){setError(e.message);}
  }
  async function conflict(){try{const latest=await api.get('anchors/'+anchorId);setRemote(latest.proposals.find((p:any)=>p.id===proposal.id));}catch(e:any){setError(e.message);}}
  function resolveConflict(mine:boolean){
    const local=save.current.current;current.current=remote;initial.current=mine?local:remote.nodes;startSave(remote);setVersion(v=>v+1);setRemote(null);setState('saved');setError('');if(mine)save.current.change(local);
  }
  const adopting=proposal.status!=='draft';
  const comments=Object.fromEntries(data.threads.filter((t:any)=>t.proposalId===proposal.id).map((t:any)=>[t.proposalNodeId,data.threads.filter((x:any)=>x.proposalId===proposal.id&&x.proposalNodeId===t.proposalNodeId).length]));
  const rootId=proposal.editRootId??proposal.nodes[0]?.id;
  if(proposal.kind==='edit')comments[rootId]=(comments[rootId]??0)+data.threads.filter((t:any)=>originalThread(data,t)).length;
  async function removeEmpty(children:any=[]){save.current.change(children);if(await save.current.flush())await refresh();}
  return <div className="collaboration-contribution" data-proposal-id={proposal.id} data-status={proposal.status}>
    <div className={adopting||['error','conflict'].includes(state)?'collaboration-save-state':'collaboration-visually-hidden'}><span role="status">{adopting?(proposal.status==='accepted'?'已采纳':proposal.operation?.status==='attention'?'同步需要核查，请站长查看本机记录':proposal.operation?.status==='retry'?'发布暂未完成，将继续重试':'正在同步到 RemNote 并发布…'):statusText[state]}</span>
    </div>
    {(proposal.status!=='accepted'||history)&&initial.current.length>0&&<>{history&&<p className="text-xs">私密讨论历史（正式正文中的 @ 已移除）</p>}<RichEditor key={version} initial={initial.current} tree inlineRoot={proposal.kind==='edit'} users={users} readOnly={adopting||state==='conflict'} editorRef={editor} onChange={(nodes:any)=>save.current.change(nodes)} onEmpty={(children:any)=>void removeEmpty(children)} comments={comments} owner={api.user.owner} onComment={setCommentNode} onApprove={showPreview} label={history?'私密讨论历史':proposal.kind==='edit'?'修改节点编辑器':'新增子节点编辑器'}/></>}
    {error&&<p role="status" className="text-sm text-destructive">{error}</p>}
    {state==='error'&&<Button variant="outline" size="sm" onClick={()=>void save.current.flush()}>重试保存</Button>}
    {state==='conflict'&&<div><Button variant="outline" size="sm" onClick={()=>void conflict()}>对照最新版本</Button>{remote&&<><p>对方的最新内容：</p><RichEditor key={'remote-'+remote.revision} initial={remote.nodes} tree readOnly/>
      <Button size="sm" variant="outline" onClick={()=>resolveConflict(false)}>载入对方版本</Button> <Button size="sm" onClick={()=>resolveConflict(true)}>保留我的内容继续编辑</Button></>}</div>}
    {preview&&<div role="region" aria-label="正式正文预览" className="collaboration-adoption-preview"><p>{preview.kind==='edit'?'更新原节点文字，保留原 ID 和已有子节点。':'只采纳所选节点及其子树。'}@ 标记不会写入正式正文。</p><Projection nodes={preview.nodes}/><Button size="sm" onClick={()=>void approve()}>确认采纳</Button> <Button variant="ghost" size="sm" onClick={()=>setPreview(null)}>取消</Button></div>}
    {commentNode&&<div className="collaboration-inline-discussion"><DiscussionPanel api={api} anchorId={anchorId} data={data} proposalId={proposal.id} proposalNodeId={commentNode} includeOriginal={proposal.kind==='edit'&&commentNode===rootId} refresh={refresh} highlight={notificationTarget?.sourceId} onClose={()=>setCommentNode(null)}/></div>}
  </div>;
}
function Projection({nodes}:any){return <RichEditor initial={nodes} tree preview readOnly label="正式正文预览编辑器"/>;}
export function ProposalGroup(props:any){return <>{props.data.proposals.filter((p:any)=>p.kind!=='edit'||props.edit).filter((p:any)=>!props.edit||p.kind==='edit').map((p:any)=><Proposal key={p.id} {...props} proposal={p}/>)}</>;}

export function Bell({inbox,onOpen,onJump,onMore,error}:any){
  const [open,setOpen]=useState(false),[jumpError,setJumpError]=useState('');
  const verbs:any={mention:'在内容中提及了你',reply:'回复了你',comment:'添加了批注',read:'已读你的消息'};
  return <Popover open={open} onOpenChange={value=>{setOpen(value);if(value)onOpen();}}><span id="pt-notifications-notice"><PopoverTrigger asChild>
    <button type="button" className={'mw-echo-notifications-badge '+(inbox.unreadCount?'mw-echo-unseen-notifications':'mw-echo-notifications-badge-all-read')} data-counter-text={inbox.unreadCount>99?'99+':inbox.unreadCount} aria-label={`消息提醒，${inbox.unreadCount} 条未读`}><BellIcon className="collaboration-bell-icon"/>消息提醒</button>
  </PopoverTrigger></span><PopoverContent className="w-[420px] max-w-[calc(100vw-24px)] p-0" align="end" aria-label="消息提醒列表"><div className="p-4 font-semibold">消息提醒</div>
    {(error||jumpError)&&<p className="p-4 text-sm text-destructive" role="status">{error||jumpError}</p>}
    <div className="mw-echo-ui-notificationsListWidget max-h-[65vh] overflow-y-auto">
      {!inbox.items.length&&<p className="p-4 text-sm">暂无消息</p>}
      {inbox.items.map((n:any)=><a key={n.id} href={'/blog/#node-'+n.anchorId} className={'mw-echo-ui-notificationItemWidget '+(n.unread?'mw-echo-ui-notificationItemWidget-unread':'')} data-notification-id={n.id} onClick={async e=>{e.preventDefault();try{await onJump(n);setOpen(false);setJumpError('');}catch(err:any){setJumpError(err.message);}}}>
        <span className="mw-echo-ui-notificationItemWidget-icon">{n.reasons.includes('read')?<CheckIcon className="size-5"/>:<MessageSquareTextIcon className="size-5"/>}</span>
        <span className="mw-echo-ui-notificationItemWidget-content"><span className="mw-echo-ui-notificationItemWidget-content-message"><span className="mw-echo-ui-notificationItemWidget-content-message-header"><b>{n.actorName}</b> {verbs[n.reasons.includes('reply')?'reply':n.reasons.includes('mention')?'mention':n.reasons[0]]}{n.superseded?'（已回复）':''}</span><span className="mw-echo-ui-notificationItemWidget-content-message-body block">{n.summary}</span></span><span className="mw-echo-ui-notificationItemWidget-content-actions"><time className="mw-echo-ui-notificationItemWidget-content-actions-timestamp">{date(n.createdAt)}</time></span></span>
      </a>)}
      {inbox.nextOffset!==null&&<Button className="w-full" variant="ghost" onClick={onMore}>更早的消息</Button>}
    </div></PopoverContent></Popover>;
}
export function mount(host:HTMLElement,Component:any,props:any){const root=createRoot(host);root.render(<Component {...props}/>);return {update:(next:any)=>root.render(<Component {...next}/>),dispose:()=>root.unmount()};}
export function update(root:any,Component:any,props:any){root.update(props);}
