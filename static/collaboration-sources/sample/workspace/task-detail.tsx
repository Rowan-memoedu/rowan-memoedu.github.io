import React,{useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {beijingNow,statuses} from './model.mjs';
import {NodeCollaboration} from './node-collaboration';

const initialDraft=task=>{const now=beijingNow();return {...task,startAt:task.startAt??now,deadline:task.deadline??now,duration:task.duration??(!task.startAt&&!task.deadline?{years:0,months:0,days:0}:null)};};

function CivilTime({label,value,onChange}){
  const [precise,setPrecise]=useState(Boolean(value?.includes('T')));
  useEffect(()=>{if(value?.includes('T'))setPrecise(true);},[value]);
  return <label>{label}<span className="workspace-inline"><input type={precise?'datetime-local':'date'} aria-label={label} value={value??''} min={precise?'1900-01-01T00:00':'1900-01-01'} max={precise?'2200-12-31T23:59':'2200-12-31'} onChange={e=>onChange(e.target.value||null)}/><button type="button" onClick={()=>onChange(null)} aria-label={'清空'+label}>清空</button></span><span className="workspace-inline"><input type="checkbox" checked={precise} onChange={e=>{const enabled=e.target.checked;setPrecise(enabled);if(value)onChange(enabled?value.slice(0,10)+'T00:00':value.slice(0,10));}}/>设置时分</span></label>;
}

export function TaskDetail({task,snapshot,projects,api,collaboration,mutate,busy,onClose,Modal}){
  const [draft,setDraft]=useState(()=>initialDraft(task)),[error,setError]=useState('');
  const [predecessors,setPredecessors]=useState(()=>snapshot.dependencies.filter(d=>d.successor_id===task.id).map(d=>d.predecessor_id));
  const [dependencyChanged,setDependencyChanged]=useState(false),[timing,setTiming]=useState(false);
  const [targetProject,setTargetProject]=useState(snapshot.projectId);
  const current=snapshot.tasks.find(t=>t.id===task.id),changed=current&&current.revision!==draft.revision;
  const writable=snapshot.project.role!=='viewer'&&!snapshot.project.archived;
  const draftRef=useRef(draft),sequence=useRef(0),timeFields=useRef([]);draftRef.current=draft;
  const dirty=useRef(false);
  function loadCurrent(){
    dirty.current=false;timeFields.current=[];sequence.current++;setTiming(false);setDraft(initialDraft(current));
    setPredecessors(snapshot.dependencies.filter(d=>d.successor_id===task.id).map(d=>d.predecessor_id));setDependencyChanged(false);setError('');
  }
  useEffect(()=>{if(current&&current.revision!==draftRef.current.revision&&!dirty.current)loadCurrent();},[current?.revision]);
  function close(){onClose();}
  const field=(key,value)=>{dirty.current=true;setDraft(d=>({...d,[key]:value}));};
  async function time(key,value){
    dirty.current=true;
    const fields=timeFields.current=[...timeFields.current.filter(k=>k!==key),key].slice(-2),basis={...draftRef.current,[key]:value};
    const round=++sequence.current;setDraft(basis);setTiming(true);setError('');
    try{const values=await api.post('schedule',{current:basis,fields:Object.fromEntries(fields.map(k=>[k,basis[k]]))});if(round===sequence.current)setDraft(d=>({...d,...values}));}
    catch(e){if(round===sequence.current)setError(e.message);}
    finally{if(round===sequence.current)setTiming(false);}
  }
  async function save(event){
    event.preventDefault();setError('');
    try{
      const fields=Object.fromEntries(['description','status','assigneeIds','startAt','deadline','duration','location'].map(k=>[k,draft[k]]));
      await mutate('tasks/save',{taskId:task.id,revision:draft.revision,fields,...(dependencyChanged?{predecessorIds:predecessors}:{})});
      await close();
    }catch(e){setError(e.message);}
  }
  async function archive(){
    try{await mutate('tasks/save',{taskId:task.id,revision:draft.revision,fields:{archived:!draft.archived}});onClose();}catch(e){setError(e.message);}
  }
  return <Modal title={task.title} onClose={()=>void close()} busy={busy}>
    {error&&<p role="alert" className="workspace-error">{error}</p>}
    {changed&&<p className="workspace-error">事项已有更新。<Button variant="outline" disabled={busy} onClick={loadCurrent}>载入最新内容</Button></p>}
    <form onSubmit={save} className="workspace-form"><fieldset disabled={!writable||busy}>
      <div className="workspace-fields">
        <label>状态<select aria-label="状态" value={draft.status} onChange={e=>field('status',e.target.value)}>{statuses.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <CivilTime label="开始时间" value={draft.startAt} onChange={value=>void time('startAt',value)}/>
        <CivilTime label="截止时间" value={draft.deadline} onChange={value=>void time('deadline',value)}/>
        <fieldset className="workspace-duration"><legend>总时长</legend><div className="workspace-duration-parts">{[['years','年',100],['months','月',1200],['days','日',36600]].map(([key,label,max])=><label key={key}>{label}<input aria-label={'总时长（'+label+'）'} type="number" min={0} max={max} step={key==='days'?'any':1} value={draft.duration?.[key]??''} onChange={e=>void time('duration',{years:0,months:0,days:0,...draft.duration,[key]:e.target.value===''?0:Number(e.target.value)})}/></label>)}</div><button type="button" onClick={()=>void time('duration',null)}>清空总时长</button></fieldset>
      </div>
      <p className="workspace-hint">北京时间；时间可清空。设置开始、截止和总时长中的两项，自动计算第三项。年月按日历计算，日可填写小数。</p>
      <fieldset className="workspace-choices"><legend>负责人（可多选）</legend>{snapshot.members.map(member=><label key={member.id}><Checkbox aria-label={member.name} checked={draft.assigneeIds.includes(member.id)} onCheckedChange={checked=>field('assigneeIds',checked?[...draft.assigneeIds,member.id]:draft.assigneeIds.filter(id=>id!==member.id))}/>{member.name}</label>)}</fieldset>
      <label>地点<input value={draft.location} maxLength={500} onChange={e=>field('location',e.target.value)}/></label>
      <label>计划说明<textarea aria-label="计划说明" rows={3} value={draft.description} maxLength={20000} onChange={e=>field('description',e.target.value)}/></label>
      <fieldset className="workspace-choices"><legend>前置依赖（全部完成后才能完成此项）</legend>{snapshot.tasks.filter(t=>t.id!==task.id&&!t.archived&&t.todoEnabled).map(item=><label key={item.id}><Checkbox aria-label={'依赖 '+item.title} checked={predecessors.includes(item.id)} onCheckedChange={checked=>{dirty.current=true;setDependencyChanged(true);setPredecessors(ids=>checked?[...ids,item.id]:ids.filter(id=>id!==item.id));}}/>{item.title}</label>)}</fieldset>
      <div className="workspace-toolbar"><Button type="submit" disabled={busy||timing||changed}>保存设置</Button><Button type="button" variant="outline" disabled={busy||changed} onClick={()=>void archive()}>{draft.archived?'取消归档并恢复节点':'归档事项'}</Button></div>
      {!draft.archived&&current?.nodeId&&<div className="workspace-toolbar"><label>移动到项目<select aria-label="移动到项目" value={targetProject} onChange={e=>setTargetProject(e.target.value)}>{projects.filter(p=>!p.archived&&p.role!=='viewer'&&p.document_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Button type="button" variant="outline" disabled={busy||changed||targetProject===snapshot.projectId} onClick={async()=>{try{await mutate('tasks/relocate',{taskId:task.id,revision:draft.revision,targetProjectId:targetProject});onClose();}catch(e){setError(e.message);}}}>移动事项及子事项</Button></div>}
    </fieldset></form>
    {current?.nodeId&&<NodeCollaboration api={collaboration} nodeId={current.nodeId} writable={writable&&!current.archived}/>}
  </Modal>;
}
