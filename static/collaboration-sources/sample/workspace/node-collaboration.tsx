import React,{useEffect,useRef,useState} from 'react';
import {DiscussionPanel} from '../collaboration/panels';

/** Replies, mentions and deletes use the Blog discussion component. */
export function NodeCollaboration({api,nodeId,writable}){
  const [data,setData]=useState(null),[error,setError]=useState('');
  const generation=useRef(0);
  const refresh=async()=>{
    const current=generation.current;
    try{const next=await api.get('anchors/'+encodeURIComponent(nodeId));if(current===generation.current){setData(next);setError('');}}
    catch(e){if(current===generation.current)setError(e.message);}
  };
  useEffect(()=>{generation.current++;setData(null);void refresh();const timer=setInterval(()=>void refresh(),2500);return()=>{generation.current++;clearInterval(timer);};},[nodeId]);
  return <section className="workspace-node-collaboration">
    <div className="workspace-toolbar"><a href={'/blog/#node-'+nodeId}>在 Blog 中打开节点</a></div>
    {error&&<p role="alert">{error}</p>}
    {data&&<DiscussionPanel api={api} anchorId={nodeId} data={data} refresh={refresh} readOnly={!writable}/>}
  </section>;
}
