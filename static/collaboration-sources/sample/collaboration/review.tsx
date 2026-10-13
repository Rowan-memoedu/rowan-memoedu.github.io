import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Button} from '../upstream/collaboration/plate/components/ui/button';
import {RichEditor} from './editor';
import {createCollaborationClient} from './client.mjs';

const when=(value:number)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value*1000));
const progress=(item:any)=>{
  const states=item.operations.map((op:any)=>op.status);
  if(states.includes('attention'))return '同步需要核查，请在原节点处理';
  if(states.includes('retry'))return '同步暂未完成，将继续重试';
  if(states.some((state:string)=>['queued','writing','written','publishing'].includes(state)))return '正在同步到 RemNote…';
  if(item.status==='synced')return '已同步 RemNote，等待网站发布';
  return item.issue||'待采纳';
};

function ReviewApp({reader}:any){
  const alive=useRef(true),pending=useRef<any>(null),busyRef=useRef(false),sequence=useRef(0);
  const api=useMemo(()=>createCollaborationClient(reader,{guard:()=>{if(!alive.current)throw new DOMException('页面已离开','AbortError');}}),[reader.epoch]);
  const [snapshot,setSnapshot]=useState<any>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
  async function load(){
    const current=++sequence.current;let offset:any=0,header:any=null;const items=new Map();
    do{
      const page=await api.get('review?offset='+offset);
      if(!alive.current||current!==sequence.current)return;
      if(header&&header.snapshotId!==page.snapshotId)throw Error('编辑内容在加载期间发生变化，正在重新获取完整列表。');
      header=page;for(const item of page.items)items.set(item.id,item);offset=page.nextOffset;
    }while(offset!==null);
    if(alive.current&&current===sequence.current){setSnapshot({...header,items:[...items.values()]});setError('');}
  }
  function report(problem:any){
    if(!alive.current||problem.name==='AbortError')return;
    if([401,403,404].includes(problem.status))setSnapshot(null);
    setError(problem.message||'加载失败，请重试。');
  }
  useEffect(()=>{
    alive.current=true;let timer:any;
    if(reader.authenticated&&reader.user?.role!=='reader'){
      const poll=async()=>{
        try{if(!busyRef.current&&document.visibilityState!=='hidden')await load();}
        catch(problem){report(problem);}
        finally{if(alive.current){setLoading(false);timer=setTimeout(poll,5000);}}
      };
      void poll();
    }else setLoading(false);
    return()=>{alive.current=false;sequence.current++;clearTimeout(timer);};
  },[]);
  async function approveAll(){
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setError('');
    pending.current??={requestId:crypto.randomUUID(),items:snapshot.items.filter((item:any)=>item.approval).map((item:any)=>item.approval)};
    try{
      const response=await api.post('review/approve-all',pending.current);
      if(!alive.current)return;
      pending.current=null;setResult(response);await load();
    }catch(problem:any){
      if(problem.status&&problem.status<500)pending.current=null;
      report(problem);
    }finally{busyRef.current=false;if(alive.current)setBusy(false);}
  }
  if(!reader.authenticated)return <div><p role="status">{['checking','suspended'].includes(reader.status)?'正在恢复登录…':'登录团队账号后查看编辑节点。'}</p><Button onClick={()=>reader.showLogin()} disabled={['checking','suspended','unavailable'].includes(reader.status)}>邀请码登录</Button>{reader.status==='unavailable'&&<p role="alert">请通过顶部“重试登录验证”恢复连接。</p>}</div>;
  if(reader.user?.role==='reader')return <p>编辑节点聚合页仅向站长和团队成员开放。</p>;
  const items=snapshot?.items??[],ready=items.filter((item:any)=>item.approval).length;
  const groups=new Map<string,any[]>();for(const item of items){const group=groups.get(item.documentId)??[];group.push(item);groups.set(item.documentId,group);}
  const skipped=new Map(result?.items.filter((item:any)=>item.status==='skipped').map((item:any)=>[item.proposalId,item.message])??[]);
  return <>
    <div className="collaboration-review-toolbar">
      <p role="status">{loading?'正在加载编辑节点…':`${items.length} 份编辑内容`}</p>
      <Button variant="ghost" disabled={busy||loading} onClick={()=>{setError('');setLoading(true);void load().catch(report).finally(()=>alive.current&&setLoading(false));}}>刷新</Button>
      {snapshot?.owner&&<Button disabled={busy||loading||!snapshot.workerOnline||(!ready&&!pending.current)} onClick={()=>void approveAll()}>{busy?'正在提交…':pending.current?'重试全部采纳':'全部采纳'}</Button>}
    </div>
    {snapshot?.owner&&<p className="collaboration-review-note">{snapshot.workerOnline?'采纳后写回 RemNote；网站正文随完整更新发布。':'同步服务当前离线，请开启本机 RemNote 与同步服务。'}</p>}
    {error&&<p role="alert" className="collaboration-error">{error}</p>}
    {result&&<p role="status">已提交 {result.queued} 份，保留 {result.skipped} 份待处理。同步进度将在下方自动更新。</p>}
    {!loading&&!items.length&&!error&&<p>暂无待采纳或等待发布的编辑内容。</p>}
    <div className="mw-changeslist">{[...groups].map(([documentId,entries])=><section key={documentId}>
      <h4><a href={'/blog/#node-'+encodeURIComponent(documentId)}>{entries[0].documentTitle}</a></h4>
      <ul className="special">{entries.map((item:any)=><li key={item.id} className="mw-changeslist-line mw-changeslist-line-not-watched" data-review-proposal={item.id}>
        <div className="mw-changeslist-line-inner collaboration-review-heading"><a className="mw-changeslist-title" href={'/blog/?edit-node='+encodeURIComponent(item.anchorId)+'&proposal='+encodeURIComponent(item.id)}>{item.anchorTitle}</a><time dateTime={new Date(item.updatedAt*1000).toISOString()}>{when(item.updatedAt)}</time><span>{item.authorName}</span><span role="status">{progress(item)}</span></div>
        {skipped.has(item.id)&&<p className="collaboration-error">{String(skipped.get(item.id))}</p>}
        {item.nodes.length>0&&<div className="collaboration-review-content"><RichEditor key={item.id+':'+item.revision} initial={item.nodes} tree preview readOnly label={'编辑内容：'+item.anchorTitle}/></div>}
      </li>)}</ul>
    </section>)}</div>
  </>;
}

export function attachEditReview(reader:any){
  const element=document.getElementById('edit-review-root');if(!element)return;
  const root=createRoot(element);let version=0;
  const draw=()=>flushSync(()=>root.render(<ReviewApp key={`${reader.epoch}:${reader.status}:${version}`} reader={reader}/>));
  const clear=()=>{version++;flushSync(()=>root.render(<p role="status">正在验证访问权限…</p>));};
  window.addEventListener('personal-session-changed',draw);
  window.addEventListener('personal-access-changing',clear);
  window.addEventListener('personal-access-changed',draw);
  window.addEventListener('pagehide',clear);
  draw();void reader.ready.then(draw);
}
