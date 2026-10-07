/* MIT. Data-bound adaptations of Plate block-discussion/comment and Echo items.
 * No mock discussion store or browser persistence. See upstream manifests. */
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MessageSquareTextIcon,PlusIcon,ArrowUpIcon,BellIcon,CheckIcon,SquareIcon} from 'lucide-react';
import {Button} from '../upstream/collaboration/plate/components/ui/button';
import {Avatar,AvatarFallback} from '../upstream/collaboration/plate/components/ui/avatar';
import {Popover,PopoverContent,PopoverTrigger} from './popover';
import {RichEditor} from './editor';
import {Autosave,textOf} from './model.mjs';
const date=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value*1000));
const blank=[{text:''}];
const statusText={saved:'已保存',unsaved:'未保存',saving:'正在保存…',error:'保存失败，可重试',conflict:'另一方已修改，请对照两个版本后继续'};

function Composer({api,anchorId,thread,proposalId,proposalNodeId,replyTo,onSent}:any){
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
  return <div className="flex w-full"><div className="mt-2 mr-1 shrink-0"><Avatar className="size-5"><AvatarFallback>{api.user.name[0]}</AvatarFallback></Avatar></div>
    <div className="relative flex grow gap-2"><div className="w-full"><RichEditor key={key} initial={blank} users={users} onChange={setRuns} readOnly={busy} label={thread?'回复编辑器':'批注编辑器'} placeholder={thread?'回复，使用 @ 提及对方…':'添加批注，只有你与站长可见…'}/>
      <Button variant="ghost" size="icon-xs" aria-label="发送批注或回复" disabled={busy||!textOf(runs).trim()} onClick={()=>void submit()}><ArrowUpIcon className="size-4"/></Button>
      {error&&<p role="status" className="text-sm text-destructive">{error}</p>}</div></div></div>;
}
function Message({message,thread,onReply,highlight}:any){
  const replied=thread.messages.find((m:any)=>m.id===message.replyTo);
  return <div id={'collab-'+message.id} tabIndex={-1} data-message-id={message.id} data-highlight={highlight===message.id}>
    <div className="relative flex items-center"><Avatar className="size-5"><AvatarFallback>{message.authorName[0]}</AvatarFallback></Avatar>
      <h4 className="mx-2 font-semibold text-sm leading-none">{message.authorName}</h4><div className="text-muted-foreground/80 text-xs leading-none"><time>{date(message.createdAt)}</time></div></div>
    {replied&&<div className="relative mt-1 flex pl-[32px] text-sm text-subtle-foreground"><div className="my-px w-0.5 shrink-0 bg-highlight"/><div className="ml-2">回复 {replied.authorName}：{textOf(replied.content).slice(0,90)}</div></div>}
    <div className="relative my-1 pl-[26px]"><RichEditor initial={message.content} readOnly label="批注内容"/><Button variant="ghost" size="xs" onClick={()=>onReply(message.id)}>回复</Button></div>
  </div>;
}
export function DiscussionPanel({api,anchorId,data,proposalId,proposalNodeId,refresh,highlight}:any){
  const threads=data.threads.filter((t:any)=>proposalId?t.proposalId===proposalId&&t.proposalNodeId===proposalNodeId:!t.proposalId||!data.proposals.some((p:any)=>p.id===t.proposalId&&p.status!=='accepted'));
  const [reply,setReply]=useState<any>({}),[activeThread,setActiveThread]=useState<string|undefined>();
  useEffect(()=>{if(!highlight)return;const el=document.getElementById('collab-'+highlight);el?.scrollIntoView({block:'center'});el?.focus({preventScroll:true});},[highlight,data]);
  return <div className="max-h-[65vh] overflow-y-auto" aria-label="节点批注"><p className="p-4 text-xs text-muted-foreground">每条讨论仅参与者本人和站长可见。</p>
    {threads.map((thread:any,index:number)=><React.Fragment key={thread.id}><div className="p-4" data-thread-id={thread.id}>
      {thread.messages.map((message:any)=><Message key={message.id} thread={thread} message={message} highlight={highlight} onReply={(id:string)=>{setReply({...reply,[thread.id]:id});setActiveThread(thread.id);}}/>)}
      {activeThread===thread.id&&<Composer key={thread.id} api={api} anchorId={anchorId} thread={thread} replyTo={reply[thread.id]} onSent={refresh}/>}
      {activeThread!==thread.id&&<Button variant="ghost" size="sm" onClick={()=>setActiveThread(thread.id)}>回复这条讨论</Button>}
    </div>{index<threads.length-1&&<div className="h-px w-full bg-muted"/>}</React.Fragment>)}
    <div className="p-4"><Composer api={api} anchorId={anchorId} proposalId={proposalId} proposalNodeId={proposalNodeId} onSent={refresh}/></div>
  </div>;
}

export function Actions({api,anchorId,entry,onAdd,onOpen,openKey,data,refresh,highlight}:any){
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(openKey)setOpen(true);},[openKey]);
  return <><Popover open={open} onOpenChange={value=>{setOpen(value);if(value)void onOpen().catch((e:any)=>setError(e.message));}}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" className="mt-1 ml-1 h-6 gap-1 text-muted-foreground/80" aria-label={entry?.comments?`查看 ${entry.comments} 条批注`:'添加批注'}><MessageSquareTextIcon className="size-4"/>{entry?.comments>0&&<span className="font-semibold text-xs">{entry.comments}</span>}</Button></PopoverTrigger>
    <PopoverContent className="w-[380px] max-w-[calc(100vw-24px)] overflow-y-auto p-0" side="bottom" align="end" onOpenAutoFocus={e=>e.preventDefault()}>
      {error?<p role="status" className="p-4">{error}</p>:data?<DiscussionPanel api={api} anchorId={anchorId} data={data} refresh={refresh} highlight={highlight}/>:<p className="p-4" role="status">正在加载批注…</p>}
    </PopoverContent></Popover>
    <Button variant="ghost" size="icon-xs" aria-label="添加子节点" onClick={()=>void onAdd().catch((e:any)=>setError(e.message))}><PlusIcon className="size-4"/></Button>
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
    if(proposal.status==='accepted'){void onAccepted(proposal);return;}
    if(proposal.revision<=current.current.revision)return;
    if(state==='saved'){current.current=proposal;initial.current=proposal.nodes;startSave(proposal);setVersion(v=>v+1);}
    else if(!save.current.running){save.current.conflict=true;setState('conflict');setRemote(proposal);}
  },[proposal.revision,proposal.status]);
  async function showPreview(){
    setError('');try{if(!await save.current.flush())return;const result=await api.get('proposals/'+proposal.id+'/preview');setPreview(result);}catch(e:any){setError(e.message);}
  }
  async function approve(){
    try{await api.post('approve',{requestId:crypto.randomUUID(),proposalId:proposal.id,revision:preview.revision,projectionHash:preview.projectionHash});setPreview(null);await refresh();}catch(e:any){setError(e.message);}
  }
  async function conflict(){try{const latest=await api.get('anchors/'+anchorId);setRemote(latest.proposals.find((p:any)=>p.id===proposal.id));}catch(e:any){setError(e.message);}}
  function resolveConflict(mine:boolean){
    const local=save.current.current;current.current=remote;initial.current=mine?local:remote.nodes;startSave(remote);setVersion(v=>v+1);setRemote(null);setState('saved');setError('');if(mine)save.current.change(local);
  }
  const adopting=proposal.status!=='draft';
  return <div className="collaboration-contribution" data-proposal-id={proposal.id} data-status={proposal.status}>
    <div className="flex items-center justify-between gap-2"><span role="status" className="text-xs text-muted-foreground">{adopting?(proposal.status==='accepted'?'已采纳':proposal.operation?.status==='attention'?'同步需要核查，请站长查看本机记录':proposal.operation?.status==='retry'?'发布暂未完成，将继续重试':'正在同步到 RemNote 并发布…'):statusText[state]}</span>
    </div>
    {(proposal.status!=='accepted'||history)&&<>{history&&<p className="text-xs">私密讨论历史（正式正文中的 @ 已移除）</p>}<RichEditor key={version} initial={initial.current} tree users={users} readOnly={adopting||state==='conflict'} editorRef={editor} onChange={(nodes:any)=>save.current.change(nodes)} onComment={setCommentNode} onApprove={api.user.owner&&!adopting?()=>void showPreview():undefined} label={history?'私密讨论历史':'新增子节点编辑器'}/></>}
    {error&&<p role="status" className="text-sm text-destructive">{error}</p>}
    {state==='error'&&<Button variant="outline" size="sm" onClick={()=>void save.current.flush()}>重试保存</Button>}
    {state==='conflict'&&<div><Button variant="outline" size="sm" onClick={()=>void conflict()}>对照最新版本</Button>{remote&&<><p>对方的最新内容：</p><RichEditor key={'remote-'+remote.revision} initial={remote.nodes} tree readOnly/>
      <Button size="sm" variant="outline" onClick={()=>resolveConflict(false)}>载入对方版本</Button> <Button size="sm" onClick={()=>resolveConflict(true)}>保留我的内容继续编辑</Button></>}</div>}
    {preview&&<div role="region" aria-label="正式正文预览" className="rounded-md border p-4"><p>采纳以下整棵子树。@ 标记已移除，原讨论只保留在私密历史中。</p><Projection nodes={preview.nodes}/><Button size="sm" onClick={()=>void approve()}>确认采纳</Button> <Button variant="ghost" size="sm" onClick={()=>setPreview(null)}>取消</Button></div>}
    {commentNode&&<div className="rounded-md border"><div className="flex justify-end"><Button variant="ghost" size="xs" onClick={()=>setCommentNode(null)}>关闭批注</Button></div><DiscussionPanel api={api} anchorId={anchorId} data={data} proposalId={proposal.id} proposalNodeId={commentNode} refresh={refresh} highlight={notificationTarget?.sourceId}/></div>}
  </div>;
}
function Projection({nodes}:any){return <RichEditor initial={nodes} tree readOnly label="正式正文预览编辑器"/>;}
export function ProposalGroup(props:any){return <>{props.data.proposals.map((p:any)=><Proposal key={p.id} {...props} proposal={p}/>)}</>;}

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
