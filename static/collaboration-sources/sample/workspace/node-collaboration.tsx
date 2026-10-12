import React,{useEffect,useRef,useState} from 'react';
import {DiscussionPanel,ProposalGroup} from '../collaboration/panels';
import {Button} from '@/components/ui/button';

/** Surface binding only; editing, replies, mentions and deletes are shared. */
export function NodeCollaboration({api,nodeId,writable,flushRef}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[editing,setEditing]=useState(false);
  const generation=useRef(0),savers=useRef(new Set<()=>Promise<boolean>>());
  useEffect(()=>{if(flushRef)flushRef.current=async()=>{for(const save of savers.current)if(!await save())return false;return true;};return()=>{if(flushRef)flushRef.current=null;};},[flushRef]);
  const refresh=async()=>{
    const current=generation.current;
    try{const next=await api.get('anchors/'+encodeURIComponent(nodeId));if(current===generation.current)setData(next);}
    catch(e){if(current===generation.current)setError(e.message);}
  };
  useEffect(()=>{generation.current++;setData(null);void refresh();const timer=setInterval(()=>void refresh(),2500);return()=>{generation.current++;clearInterval(timer);};},[nodeId]);
  async function edit(){
    try{await api.post('proposals',{requestId:crypto.randomUUID(),anchorId:nodeId,mode:'outline'});setEditing(true);await refresh();}
    catch(e){setError(e.message);}
  }
  return <section className="workspace-node-collaboration">
    <div className="workspace-toolbar"><a href={'/blog/#node-'+nodeId}>在 Blog 中打开节点</a>{writable&&<Button type="button" variant="outline" onClick={()=>void edit()}>编辑节点</Button>}</div>
    {error&&<p role="alert">{error}</p>}
    {data&&editing&&<ProposalGroup api={api} anchorId={nodeId} data={data} edit refresh={refresh} onAccepted={refresh} registerSave={save=>{savers.current.add(save);return()=>savers.current.delete(save);}}/>}
    {data&&<DiscussionPanel api={api} anchorId={nodeId} data={data} refresh={refresh} readOnly={!writable}/>}
  </section>;
}
