import React,{useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Card,CardContent,CardHeader,CardTitle} from '@workspace-ui/card';
import {createWorkspaceClient,byDeadline,dateText,overdue,statuses} from './model.mjs';
import {TaskBoard,TaskCalendar,TaskTimeline} from './views';
import {TaskDetail} from './task-detail';
import {createCollaborationClient} from '../collaboration/client.mjs';
import {taskHierarchy} from './hierarchy.mjs';
import {optimisticSnapshot} from './optimistic.mjs';

function Modal({title,onClose,busy,children}){
  const ref=useRef(null),id=useId();
  useEffect(()=>{const previous=document.activeElement;ref.current.showModal();return()=>{ref.current?.close();previous?.focus?.();};},[]);
  return <dialog ref={ref} className="collaboration-ui workspace-ui workspace-dialog" aria-labelledby={id} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <header className="workspace-toolbar"><h2 id={id}>{title}</h2><Button variant="ghost" onClick={onClose} disabled={busy} aria-label="关闭对话框">关闭</Button></header>
    {children}
  </dialog>;
}


function ProjectSettings({snapshot,people,mutate,busy,onClose}){
  const [name,setName]=useState(snapshot.project.name),[description,setDescription]=useState(snapshot.project.description),[user,setUser]=useState(''),[role,setRole]=useState('editor'),[error,setError]=useState('');
  const revision=useRef(snapshot.revision);
  const baseline=useRef({name:snapshot.project.name,description:snapshot.project.description});
  const changed=snapshot.project.name!==baseline.current.name||snapshot.project.description!==baseline.current.description;
  const perform=async(route,fields)=>{
    setError('');const metadata=route==='projects/update'&&'name' in fields.fields;
    try{
      if(metadata&&changed)throw Error('项目说明已被更新，请载入最新内容后核对');
      const result=await mutate(route,{revision:metadata?revision.current:snapshot.revision,...fields});
      if(metadata){baseline.current={name,description};revision.current=result.revision;}
      return true;
    }catch(e){if(e.name!=='AbortError')setError(e.message);}
  };
  const selectable=people.filter(p=>!snapshot.members.some(m=>m.id===p.id));
  useEffect(()=>{if(!changed)revision.current=snapshot.revision;},[snapshot.revision]);
  return <Modal title="项目与成员" onClose={onClose} busy={busy}>
    {error&&<p role="alert" className="workspace-error">{error}</p>}
    {changed&&<p className="workspace-error">项目说明已有更新。<Button variant="outline" disabled={busy} onClick={()=>{setName(snapshot.project.name);setDescription(snapshot.project.description);baseline.current={name:snapshot.project.name,description:snapshot.project.description};revision.current=snapshot.revision;}}>载入最新项目内容</Button></p>}
    <form className="workspace-form" onSubmit={e=>{e.preventDefault();void perform('projects/update',{fields:{name,description}});}}>
      <fieldset disabled={busy}><label>项目名称<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>项目说明<textarea aria-label="项目说明" rows={2} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)}/></label><Button type="submit">保存项目</Button></fieldset>
    </form>
    <h3>项目成员</h3><label className="workspace-inline"><input type="checkbox" checked={!!snapshot.project.team_open} disabled={busy} onChange={e=>void perform('projects/update',{fields:{teamOpen:e.target.checked}})}/>默认向全体团队成员开放</label><p className="workspace-hint">可以移除成员或设为只读。关闭默认开放后，新加入团队的账号需要单独添加。</p>
    <ul className="workspace-members">{snapshot.members.map(m=><li key={m.id}><span>{m.name}{!m.enabled?'（已停用）':''}</span>{m.role==='owner'?<span>项目负责人</span>:<>
      <select aria-label={`${m.name}的项目权限`} value={m.role} disabled={busy} onChange={e=>void perform('members',{userId:m.id,role:e.target.value})}><option value="editor">可编辑</option><option value="viewer">只读</option></select>
      <Button variant="ghost" disabled={busy} onClick={()=>void perform('members',{userId:m.id,role:null})} aria-label={`移除成员 ${m.name}`}>移除</Button>
    </>}</li>)}</ul>
    <form className="workspace-toolbar" onSubmit={e=>{e.preventDefault();void perform('members',{userId:user,role}).then(ok=>{if(ok)setUser('');});}}>
      <select aria-label="添加项目成员" value={user} required disabled={busy} onChange={e=>setUser(e.target.value)}><option value="">选择团队账号</option>{selectable.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select aria-label="新成员权限" value={role} disabled={busy} onChange={e=>setRole(e.target.value)}><option value="editor">可编辑</option><option value="viewer">只读</option></select>
      <Button type="submit" disabled={busy||!user}>添加成员</Button>
    </form>
    <p className="workspace-hint">项目归档后保留全部待办和讨论，可以恢复。</p>
    <Button variant="outline" disabled={busy} onClick={()=>void perform('projects/update',{fields:{archived:!snapshot.project.archived}})}>{snapshot.project.archived?'恢复项目':'归档项目'}</Button>
  </Modal>;
}

function WorkspaceApp({reader}){
  const api=useMemo(()=>createWorkspaceClient(reader),[]);
  const collaboration=useMemo(()=>createCollaborationClient(reader),[]);
  const [projects,setProjects]=useState([]),[people,setPeople]=useState([]),[selected,setSelected]=useState(''),[storedSnapshot,setSnapshot]=useState(null),[pending,setPending]=useState([]);
  const snapshot=optimisticSnapshot(storedSnapshot,pending);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [title,setTitle]=useState(''),[view,setView]=useState('list'),[detail,setDetail]=useState(null),[settings,setSettings]=useState(false),[create,setCreate]=useState(false),[projectName,setProjectName]=useState('');
  const [filter,setFilter]=useState('all'),[archive,setArchive]=useState(false);
  const alive=useRef(true),lock=useRef(false),current=useRef(null),selectedRef=useRef(''),sequence=useRef(0);
  const queue=useRef(Promise.resolve()),requests=useRef(0),blocking=useRef(0),known=useRef(new Map());
  current.current=storedSnapshot;selectedRef.current=selected;
  const clearProject=()=>{setSnapshot(null);setSelected('');setDetail(null);setSettings(false);setTitle('');};
  const loadIndex=useCallback(async()=>{
    const result=await api.get('projects');if(alive.current)setProjects(result.projects);return result.projects;
  },[api]);
  const loadProject=useCallback(async(id,incremental=false)=>{
    const round=++sequence.current,revision=incremental&&current.current?.projectId===id?current.current.revision:null;
    const result=await api.get('projects/'+id+(revision?'?since='+revision:''));
    if(!result.unchanged&&(!known.current.has(id)||result.revision>=known.current.get(id).revision))known.current.set(id,result);
    if(alive.current&&selectedRef.current===id&&round===sequence.current&&!result.unchanged){current.current=result;setSnapshot(result);}
    return result;
  },[api]);
  const report=error=>{
    if(!alive.current||error.name==='AbortError')return;
    if([401,403,404].includes(error.status)){clearProject();void loadIndex().catch(()=>{});}
    setError(error.message||'连接失败，请重试。');
  };
  const select=id=>{sequence.current++;setSelected(id);selectedRef.current=id;setSnapshot(null);setDetail(null);setSettings(false);setTitle('');setError('');setNotice('');setArchive(false);history.replaceState(null,'',id?'#'+id:location.pathname);};
  useEffect(()=>{
    const navigate=()=>{const id=location.hash.slice(1);if(id!==selectedRef.current&&projects.some(project=>project.id===id))select(id);};
    window.addEventListener('hashchange',navigate);return()=>window.removeEventListener('hashchange',navigate);
  },[projects]);
  useEffect(()=>{
    alive.current=true;
    if(!reader.authenticated){setLoading(false);return()=>{alive.current=false;};}
    Promise.all([loadIndex(),api.get('people')]).then(([list,directory])=>{
      if(!alive.current)return;setPeople(directory.users);
      const hash=location.hash.slice(1),initial=list.find(p=>p.id===hash)?.id??list.find(p=>!p.archived)?.id??list[0]?.id;
      if(initial)select(initial);
    }).catch(report).finally(()=>{if(alive.current)setLoading(false);});
    return()=>{alive.current=false;};
  },[]);
  useEffect(()=>{
    if(!selected)return;
    void loadProject(selected).catch(report);
    let running=false;
    const poll=async()=>{if(document.hidden||running||lock.current)return;running=true;try{await loadProject(selected,true);await loadIndex();}catch(e){report(e);}finally{running=false;}};
    const timer=setInterval(poll,5000);window.addEventListener('focus',poll);
    return()=>{clearInterval(timer);window.removeEventListener('focus',poll);};
  },[selected]);
  function mutate(route,fields,global=false,immediate=false){
    const id=selectedRef.current,request=crypto.randomUUID();
    requests.current++;lock.current=true;sequence.current++;setError('');setNotice('');
    if(!immediate){blocking.current++;setBusy(true);}
    if(immediate)setPending(items=>[...items,{id:request,projectId:id,taskId:fields.taskId,fields:route==='tasks/move'?{status:fields.status}:fields.fields}]);
    const perform=async()=>{
      try{
        let sent=fields;
        if(immediate){
          const basis=known.current.get(id),task=basis?.tasks.find(item=>item.id===fields.taskId);
          if(task)sent={...fields,revision:task.revision,...(route==='tasks/move'?{projectRevision:basis.revision}:{})};
        }
        const result=await api.post(route,{...(!global?{projectId:id}:{}),...sent});
        if(!alive.current)return result;
        if(result.snapshot){
          known.current.set(result.projectId,result.snapshot);
          if(selectedRef.current===result.projectId){sequence.current++;current.current=result.snapshot;setSnapshot(result.snapshot);}
          const active=result.snapshot.tasks.filter(task=>task.todoEnabled&&!task.archived);
          setProjects(items=>items.map(project=>project.id===result.projectId?{...project,...result.snapshot.project,total:active.length,completed:active.filter(task=>task.status==='done').length}:project));
        }
        void loadIndex().catch(()=>{});setNotice('已保存');return result;
      }catch(e){
        report(e);
        if((e.status===409||!e.status)&&e.name!=='AbortError'&&id&&selectedRef.current===id)await loadProject(id).catch(report);
        throw e;
      }finally{
        requests.current--;lock.current=requests.current>0;if(!immediate)blocking.current--;
        if(alive.current){setBusy(blocking.current>0);setPending(items=>items.filter(item=>item.id!==request));}
      }
    };
    const result=queue.current.then(perform);queue.current=result.catch(()=>{});return result;
  }
  async function createProject(event){
    event.preventDefault();try{const result=await mutate('projects/create',{name:projectName},true);if(alive.current){setCreate(false);setProjectName('');select(result.projectId);}}catch{}
  }
  async function addTask(event){
    event?.preventDefault();if(!title.trim()||blocking.current)return;
    try{await mutate('tasks/save',{fields:{title}});if(alive.current)setTitle('');}catch{}
  }
  const shortcut=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!event.nativeEvent.isComposing&&!event.repeat){event.preventDefault();void addTask();}};
  const saveTask=(task,fields)=>mutate('tasks/save',{taskId:task.id,revision:task.revision,fields},false,true).catch(()=>{});
  const moveTask=(task,status,beforeId,projectRevision)=>mutate('tasks/move',{taskId:task.id,revision:task.revision,projectRevision,status,beforeId},false,true).catch(()=>{});
  async function download(){
    try{const result=await api.get(`projects/${selected}/export`);if(!alive.current)return;const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`workspace-${selected}.json`;a.click();URL.revokeObjectURL(url);setNotice('项目已导出');}catch(e){report(e);}
  }
  if(!reader.authenticated)return <Card><CardContent className="py-6"><p>{['checking','suspended'].includes(reader.status)?'正在恢复登录…':'登录后查看你参与的项目与待办。'}</p><Button className="mt-4" onClick={()=>reader.showLogin()} disabled={['checking','suspended','unavailable'].includes(reader.status)}>邀请码登录</Button>{reader.status==='unavailable'&&<p role="alert">请通过顶部“重试登录验证”恢复连接。</p>}</CardContent></Card>;
  if(reader.user?.role==='reader')return <p>当前账号没有 Workspace 权限，请联系站长开通团队账号。</p>;
  const writable=snapshot&&snapshot.project.role!=='viewer'&&!snapshot.project.archived;
  const tasks=(snapshot?.tasks??[]).filter(t=>t.todoEnabled&&t.archived===archive&&(filter==='all'||filter==='open'&&t.status!=='done'||filter==='mine'&&t.assigneeIds.includes(reader.user.id)));
  const active=(snapshot?.tasks??[]).filter(t=>t.todoEnabled&&!t.archived),done=active.filter(t=>t.status==='done').length;
  const names=new Map(snapshot?.members.map(m=>[m.id,m.name])??[]);
  const taskLocked=task=>!writable||task.archived;
  const renderTask=task=><div className="workspace-task" data-task-id={task.id} data-task-revision={task.revision} data-done={task.status==='done'}>
    <Checkbox aria-label={`完成待办 ${task.title}`} checked={task.status==='done'} disabled={taskLocked(task)} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onCheckedChange={done=>void saveTask(task,{status:done?'done':'todo'})}/>
    <div className="workspace-task-main"><button type="button" className="workspace-task-title" onClick={()=>setDetail(task)} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>{task.title}</button>
      <p className="workspace-task-meta"><span className={overdue(task)?'workspace-overdue':''}>{overdue(task)?'已逾期 · ':''}{dateText(task.deadline)}</span>{task.location&&<span>地点：{task.location}</span>}{task.assigneeIds.length>0&&<span>负责人：{task.assigneeIds.map(id=>names.get(id)??'已停用成员').join('、')}</span>}</p>
    </div>
    <select aria-label={`${task.title}的状态`} value={task.status} disabled={taskLocked(task)} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>void saveTask(task,{status:e.target.value})}>{statuses.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
  </div>;
  return <>
    <div className="workspace-toolbar"><label>项目 <select aria-label="选择项目" value={selected} disabled={busy} onChange={e=>select(e.target.value)}><option value="">选择项目</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}{p.archived?'（已归档）':''}</option>)}</select></label><Button variant="outline" disabled={busy} onClick={()=>setCreate(true)}>新建项目</Button><Button variant="ghost" disabled={busy||loading} onClick={()=>{setError('');void loadIndex().then(()=>selected&&loadProject(selected)).catch(report);}}>刷新</Button></div>
    <div className="workspace-status" aria-live="polite">{busy?'正在保存…':notice}</div>
    {error&&<p role="alert" className="workspace-error">{error}</p>}
    {loading&&<p role="status">正在加载项目…</p>}
    {!loading&&!selected&&<Card><CardContent className="py-6"><p>还没有选择项目。创建项目后，即可添加待办并邀请团队成员。</p></CardContent></Card>}
    {selected&&!snapshot&&!error&&<p role="status">正在加载待办…</p>}
    {snapshot&&<Card className="workspace-project" data-project-revision={snapshot.revision}><CardHeader><div className="workspace-toolbar"><CardTitle>{snapshot.project.name}</CardTitle>{snapshot.project.role==='owner'&&<Button variant="outline" disabled={busy} onClick={()=>setSettings(true)}>项目与成员</Button>}<Button variant="ghost" disabled={busy} onClick={()=>void download()}>导出项目</Button></div>
      {snapshot.project.description&&<p>{snapshot.project.description}</p>}
      <p className="workspace-hint">{snapshot.members.length} 位成员 · {done}/{active.length} 项完成{snapshot.project.archived?' · 项目已归档':snapshot.project.role==='viewer'?' · 只读':''}</p>
      <progress aria-label="项目完成进度" value={done} max={Math.max(1,active.length)}/>
    </CardHeader><CardContent>
      {writable&&<form className="workspace-toolbar workspace-quick-add" onSubmit={addTask}><label className="workspace-grow">新增待办<input aria-label="新增待办" value={title} maxLength={500} placeholder="写下待办，Ctrl + Enter 创建" disabled={busy} onChange={e=>setTitle(e.target.value)} onKeyDown={shortcut}/></label><Button type="submit" disabled={busy||!title.trim()}>添加待办</Button></form>}
      <div className="workspace-toolbar workspace-viewbar"><div role="group" aria-label="待办视图">{[['list','列表'],['board','看板'],['timeline','时间轴'],['calendar','日历']].map(([id,label])=><Button key={id} variant={view===id?'default':'ghost'} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</Button>)}</div>
        <select aria-label="筛选待办" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部待办</option><option value="open">未完成</option><option value="mine">我负责的</option></select>
        <label className="workspace-inline"><input type="checkbox" checked={archive} onChange={e=>setArchive(e.target.checked)}/>已归档</label>
      </div>
      {view==='list'&&(tasks.length?<ul className="workspace-task-list" role="tree" aria-label="待办层级">{taskHierarchy(tasks).map(task=><li key={task.id} role="treeitem" aria-level={task.depth+1} style={{paddingLeft:Math.min(task.depth,8)*20}}>{renderTask(task)}</li>)}</ul>:<p className="workspace-empty">{archive?'没有已归档的待办。':'这里还没有待办。'}</p>)}
      {view==='board'&&<TaskBoard tasks={tasks} dependencies={snapshot.dependencies} revision={snapshot.revision} disabled={!writable||archive} renderTask={renderTask} onMove={moveTask}/>}
      {view==='timeline'&&<TaskTimeline tasks={tasks} dependencies={snapshot.dependencies} onOpen={setDetail}/>}
      {view==='calendar'&&<TaskCalendar tasks={tasks} onOpen={setDetail}/>}
      {['timeline','calendar'].includes(view)&&<details className="workspace-undated"><summary>未设截止时间（{tasks.filter(t=>!t.deadline).length}）</summary><ul className="workspace-task-list">{tasks.filter(t=>!t.deadline).map(task=><li key={task.id}>{renderTask(task)}</li>)}</ul></details>}
      <p className="workspace-hint workspace-footer">北京时间 · 与 Blog 共用待办</p>
    </CardContent></Card>}
    {create&&<Modal title="新建项目" onClose={()=>setCreate(false)} busy={busy}><form className="workspace-form" onSubmit={createProject}><label>项目名称<input autoFocus required maxLength={160} value={projectName} disabled={busy} onChange={e=>setProjectName(e.target.value)}/></label><p className="workspace-hint">项目对应一个 Blog document，默认对全体团队成员开放。</p>{error&&<p role="alert" className="workspace-error">{error}</p>}<Button type="submit" disabled={busy||!projectName.trim()}>创建项目</Button></form></Modal>}
    {snapshot&&detail&&<TaskDetail key={detail.id} task={detail} snapshot={snapshot} projects={projects} api={api} collaboration={collaboration} mutate={mutate} busy={busy} onClose={()=>setDetail(null)} Modal={Modal}/>}
    {snapshot&&settings&&snapshot.project.role==='owner'&&<ProjectSettings snapshot={snapshot} people={people} mutate={mutate} busy={busy} onClose={()=>setSettings(false)}/>}
  </>;
}

export function attachWorkspace(reader){
  const element=document.getElementById('workspace-root');if(!element)return;
  const root=createRoot(element);
  const draw=()=>flushSync(()=>root.render(<WorkspaceApp key={`${reader.epoch}:${reader.status}`} reader={reader}/>));
  window.addEventListener('personal-session-changed',draw);draw();void reader.ready.then(draw);
}
