import React,{useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Provider} from 'jotai';
import {Button} from '@/components/ui/button';
import {KanbanProvider,KanbanBoard,KanbanCards,KanbanCard,KanbanHeader} from '@workspace/kanban';
import {CalendarProvider,CalendarBody,CalendarHeader,useCalendarMonth,useCalendarYear} from '@workspace/calendar';
import {GanttProvider,GanttSidebar,GanttSidebarGroup,GanttSidebarItem,GanttTimeline,GanttHeader,GanttFeatureList,GanttFeatureListGroup,GanttFeatureItem,GanttContext} from '@workspace/gantt';
import {asFeature,beijingNow,byDeadline,civilDate,dateText,statuses} from './model.mjs';
import {DependencyLayer} from './dependencies';
import {taskHierarchy} from './hierarchy.mjs';

export function TaskBoard({tasks,dependencies=[],revision,disabled,renderTask,onMove}){
  const container=useRef(null),hierarchy=taskHierarchy(tasks);
  const latest=useRef(tasks);latest.current=tasks;
  const data=()=>latest.current.map(t=>({...t,name:t.title,column:t.status}));
  const [draft,setDraft]=useState(data),[round,setRound]=useState(0),drag=useRef(null);
  useEffect(()=>{if(!drag.current)setDraft(data());},[tasks]);
  const reset=()=>{drag.current=null;setDraft(data());setRound(n=>n+1);};
  const end=event=>{
    const basis=drag.current;drag.current=null;
    if(disabled||!basis||!event.over){reset();return;}
    const target=draft.find(t=>t.id===event.over.id);
    const status=target?.column??statuses.find(s=>s.id===event.over.id)?.id;
    const task=basis.tasks.find(t=>t.id===event.active.id);
    if(!status||!task){reset();return;}
    if(event.over.id===task.id&&status===task.status){reset();return;}
    void onMove(task,status,target?.id===task.id?null:target?.id??null,basis.revision).finally(reset);
  };
  return <div ref={container} className="workspace-dependency-view"><div className="workspace-board" aria-label="按状态分组的看板">
    <KanbanProvider key={round} columns={statuses} data={draft} onDataChange={setDraft}
      onDragStart={()=>{drag.current={tasks:tasks.map(t=>({...t})),revision};}}
      onDragCancel={reset} onDragEnd={end}>
      {column=><KanbanBoard id={column.id} key={column.id}>
        <KanbanHeader>{column.name} · {draft.filter(t=>t.column===column.id).length}</KanbanHeader>
        <KanbanCards id={column.id}>{item=><KanbanCard key={item.id} {...item} disabled={disabled} className="workspace-board-card">
          <div data-dependency-node={item.id} style={{paddingLeft:Math.min(hierarchy.find(t=>t.id===item.id)?.depth??0,6)*12}}>{item.parentTaskId&&<p className="workspace-hint">↳ {tasks.find(t=>t.id===item.parentTaskId)?.title??'上级事项'}</p>}{renderTask(tasks.find(t=>t.id===item.id)??item)}</div>
        </KanbanCard>}</KanbanCards>
      </KanbanBoard>}
    </KanbanProvider>
  </div><DependencyLayer container={container} dependencies={dependencies} tasks={tasks} revision={revision}/></div>;
}

function CalendarContent({tasks,onOpen}){
  const [month,setMonth]=useCalendarMonth(),[year,setYear]=useCalendarYear();
  useEffect(()=>{const now=civilDate(beijingNow());setMonth(now.getMonth());setYear(now.getFullYear());},[]);
  const dated=tasks.filter(t=>t.deadline).sort(byDeadline);
  const changeMonth=value=>{if(/^\d{4}-\d{2}$/u.test(value)){const [y,m]=value.split('-').map(Number);setYear(y);setMonth(m-1);}};
  const step=delta=>{const day=new Date(year,month+delta,1);setMonth(day.getMonth());setYear(day.getFullYear());};
  return <>
    <div className="workspace-toolbar">
      <Button variant="outline" onClick={()=>step(-1)} aria-label="上个月">上一月</Button>
      <label>截止月份 <input type="month" aria-label="截止月份" value={`${year}-${String(month+1).padStart(2,'0')}`} min="1900-01" max="2200-12" onChange={e=>changeMonth(e.target.value)}/></label>
      <Button variant="outline" onClick={()=>step(1)} aria-label="下个月">下一月</Button>
      <Button variant="ghost" onClick={()=>changeMonth(beijingNow().slice(0,7))}>本月</Button>
    </div>
    <div className="workspace-calendar-scroll" tabIndex={0} aria-label="截止日期月历，可横向滚动">
      <CalendarProvider locale="zh-CN" startDay={1} className="workspace-calendar">
        <CalendarHeader/>
        <CalendarBody features={dated.map(asFeature)}>{({feature})=>{
          const task=dated.find(t=>t.id===feature.id);
          return <button type="button" key={feature.id} className="workspace-calendar-task" data-done={task.status==='done'} onClick={()=>onOpen(task)} title={`${task.title} · ${dateText(task.deadline)}`}>
            <time>{task.deadline.slice(11)}</time> {task.status==='done'?'✓ ':''}{task.title}
          </button>;
        }}</CalendarBody>
      </CalendarProvider>
    </div>
    {!dated.some(t=>t.deadline.startsWith(`${year}-${String(month+1).padStart(2,'0')}`))&&<p className="workspace-hint">本月没有截止待办。</p>}
  </>;
}
export function TaskCalendar(props){return <Provider><CalendarContent {...props}/></Provider>;}

function FocusTimeline({date}){
  const gantt=useContext(GanttContext);
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>gantt.scrollToFeature?.({id:'focus',name:'',startAt:date,endAt:date,status:statuses[0]}));
    return()=>cancelAnimationFrame(frame);
  },[date.getTime(),gantt.sidebarWidth]);
  return null;
}
export function TaskTimeline({tasks,dependencies=[],onOpen}){
  const dated=useMemo(()=>taskHierarchy(tasks).filter(t=>t.deadline),[tasks]);
  const [month,setMonth]=useState(()=>dated[0]?.deadline.slice(0,7)??beijingNow().slice(0,7));
  const [range,setRange]=useState('daily');
  const [zoom,setZoom]=useState(100),container=useRef(null),zoomRef=useRef(zoom);zoomRef.current=zoom;
  useEffect(()=>{
    const root=container.current;if(!root)return;
    const wheel=event=>{
      if(!event.ctrlKey||!root.contains(document.activeElement))return;
      event.preventDefault();event.stopPropagation();const scroll=root.querySelector('.gantt');if(!scroll)return;
      const old=zoomRef.current,next=Math.min(500,Math.max(30,Math.round(old*Math.exp(-event.deltaY*.002))));
      if(next===old)return;const sidebar=root.querySelector('.workspace-gantt-sidebar')?.getBoundingClientRect().width??0,x=Math.max(0,event.clientX-scroll.getBoundingClientRect().left-sidebar),offset=scroll.scrollLeft;
      zoomRef.current=next;setZoom(next);requestAnimationFrame(()=>{scroll.scrollLeft=(offset+x)*next/old-x;});
    };
    root.addEventListener('wheel',wheel,{passive:false});return()=>root.removeEventListener('wheel',wheel);
  },[dated.length]);
  const firstInMonth=dated.find(t=>t.deadline.startsWith(month));
  const date=civilDate(range==='daily'&&firstInMonth?(firstInMonth.startAt?.startsWith(month)?firstInMonth.startAt:firstInMonth.deadline):month+'-01T00:00');
  const features=dated.map(task=>({...asFeature(task),name:(task.depth?'　'.repeat(Math.min(task.depth,6))+'↳ ':'')+task.title}));
  return <>
    <div className="workspace-toolbar">
      <label>定位月份 <input type="month" aria-label="时间轴月份" min="1900-01" max="2200-12" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label>
      <Button variant="ghost" onClick={()=>setMonth(beijingNow().slice(0,7))}>本月</Button>
      <select aria-label="时间轴粒度" value={range} onChange={e=>setRange(e.target.value)}><option value="daily">按日</option><option value="monthly">按月</option></select>
      <span className="workspace-hint">按截止时间排序；未设开始时间时显示截止当天。</span>
      <label>缩放 <input type="range" aria-label="时间轴缩放" min={30} max={500} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/>{zoom}%</label>
    </div>
    <div ref={container} className="workspace-dependency-view" tabIndex={0} aria-label="时间轴，选中后 Ctrl 加滚轮缩放" onPointerDown={event=>{if(!event.target.closest('button,input,select'))container.current.focus({preventScroll:true});}}>{dated.length?<Provider key={month+range}><GanttProvider initialDate={date} range={range} zoom={zoom} className="workspace-gantt">
      <GanttSidebar className="workspace-gantt-sidebar"><GanttSidebarGroup name="待办 · 截止时间">{features.map(feature=><GanttSidebarItem key={feature.id} feature={feature} onSelectItem={id=>onOpen(dated.find(t=>t.id===id))}/>)}</GanttSidebarGroup></GanttSidebar>
      <GanttTimeline><GanttHeader/><GanttFeatureList><GanttFeatureListGroup>{features.map(feature=><GanttFeatureItem key={`${feature.id}:${dated.find(t=>t.id===feature.id).revision}`} {...feature}>
        <button type="button" data-dependency-node={feature.id} className="workspace-timeline-task" style={{backgroundColor:feature.status.color}} onClick={()=>onOpen(dated.find(t=>t.id===feature.id))} title={`${feature.name} · ${dateText(dated.find(t=>t.id===feature.id).deadline)}`}>{feature.name}</button>
      </GanttFeatureItem>)}</GanttFeatureListGroup></GanttFeatureList></GanttTimeline>
      <FocusTimeline date={date}/>
    </GanttProvider></Provider>:<p className="workspace-empty">设置 deadline 后，待办会出现在时间轴中。</p>}<DependencyLayer container={container} dependencies={dependencies} tasks={tasks} revision={zoom+month+range}/></div>
  </>;
}
