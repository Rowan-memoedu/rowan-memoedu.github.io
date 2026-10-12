import React,{useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Provider} from 'jotai';
import {Button} from '@/components/ui/button';
import {KanbanProvider,KanbanBoard,KanbanCards,KanbanCard,KanbanHeader} from '@workspace/kanban';
import {CalendarProvider,CalendarBody,CalendarHeader,useCalendarMonth,useCalendarYear} from '@workspace/calendar';
import {GanttProvider,GanttSidebar,GanttSidebarGroup,GanttSidebarItem,GanttTimeline,GanttHeader,GanttFeatureList,GanttFeatureListGroup,GanttFeatureItem,GanttContext} from '@workspace/gantt';
import {asFeature,beijingNow,byDeadline,civilDate,dateText,statuses} from './model.mjs';

export function TaskBoard({tasks,revision,disabled,renderTask,onMove}){
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
  return <div className="workspace-board" aria-label="按状态分组的看板">
    <KanbanProvider key={round} columns={statuses} data={draft} onDataChange={setDraft}
      onDragStart={()=>{drag.current={tasks:tasks.map(t=>({...t})),revision};}}
      onDragCancel={reset} onDragEnd={end}>
      {column=><KanbanBoard id={column.id} key={column.id}>
        <KanbanHeader>{column.name} · {draft.filter(t=>t.column===column.id).length}</KanbanHeader>
        <KanbanCards id={column.id}>{item=><KanbanCard key={item.id} {...item} disabled={disabled} className="workspace-board-card">
          {renderTask(tasks.find(t=>t.id===item.id)??item)}
        </KanbanCard>}</KanbanCards>
      </KanbanBoard>}
    </KanbanProvider>
  </div>;
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
export function TaskTimeline({tasks,onOpen}){
  const dated=useMemo(()=>tasks.filter(t=>t.deadline).sort(byDeadline),[tasks]);
  const [month,setMonth]=useState(()=>dated[0]?.deadline.slice(0,7)??beijingNow().slice(0,7));
  const [range,setRange]=useState('daily');
  const firstInMonth=dated.find(t=>t.deadline.startsWith(month));
  const date=civilDate(range==='daily'&&firstInMonth?(firstInMonth.startAt?.startsWith(month)?firstInMonth.startAt:firstInMonth.deadline):month+'-01T00:00');
  const features=dated.map(asFeature);
  return <>
    <div className="workspace-toolbar">
      <label>定位月份 <input type="month" aria-label="时间轴月份" min="1900-01" max="2200-12" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label>
      <Button variant="ghost" onClick={()=>setMonth(beijingNow().slice(0,7))}>本月</Button>
      <select aria-label="时间轴粒度" value={range} onChange={e=>setRange(e.target.value)}><option value="daily">按日</option><option value="monthly">按月</option></select>
      <span className="workspace-hint">按截止时间排序；未设开始时间时显示截止当天。</span>
    </div>
    {dated.length?<Provider key={month+range}><GanttProvider initialDate={date} range={range} zoom={range==='daily'?100:180} className="workspace-gantt">
      <GanttSidebar className="workspace-gantt-sidebar"><GanttSidebarGroup name="待办 · 截止时间">{features.map(feature=><GanttSidebarItem key={feature.id} feature={feature} onSelectItem={id=>onOpen(dated.find(t=>t.id===id))}/>)}</GanttSidebarGroup></GanttSidebar>
      <GanttTimeline><GanttHeader/><GanttFeatureList><GanttFeatureListGroup>{features.map(feature=><GanttFeatureItem key={`${feature.id}:${dated.find(t=>t.id===feature.id).revision}`} {...feature}>
        <button type="button" className="workspace-timeline-task" style={{backgroundColor:feature.status.color}} onClick={()=>onOpen(dated.find(t=>t.id===feature.id))} title={`${feature.name} · ${dateText(dated.find(t=>t.id===feature.id).deadline)}`}>{feature.name}</button>
      </GanttFeatureItem>)}</GanttFeatureListGroup></GanttFeatureList></GanttTimeline>
      <FocusTimeline date={date}/>
    </GanttProvider></Provider>:<p className="workspace-empty">设置 deadline 后，待办会出现在时间轴中。</p>}
  </>;
}
