// Small, reproducible compatibility changes over immutable Kibo components.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function prepareWorkspaceSources(output){
  const root=path.resolve('sample/upstream/workspace');
  for(const s of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).sources){
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,s.path))).digest('hex'),s.sha256,`Pinned Workspace source changed: ${s.path}`);
  }
  fs.mkdirSync(output,{recursive:true});
  const replace=(source,before,after)=>{assert(source.includes(before),`Kibo adaptation no longer applies: ${before.slice(0,80)}`);return source.replace(before,after);};
  for(const name of ['kanban','calendar','gantt']){
    let source=fs.readFileSync(path.join(root,`packages/${name}/index.tsx`),'utf8')
      .replaceAll('"@/components/ui/','"@workspace-ui/').replaceAll('"@/lib/utils"','"@repo/shadcn-ui/lib/utils"');
    if(name==='kanban'){
      source=replace(source,'  className,\n}: KanbanCardProps<T>)','  className,\n  disabled = false,\n}: KanbanCardProps<T>)');
      source=replace(source,'} = useSortable({\n    id,','} = useSortable({\n    disabled: Boolean(disabled),\n    id,');
      source=replace(source,'useSensor(MouseSensor),','useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),');
      source=replace(source,'useSensor(TouchSensor),','useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),');
      source=source.replaceAll('let newData = [...data];','let newData = data.map(item => ({ ...item }));');
      source=replace(source,'<DragOverlay>','<DragOverlay className="collaboration-ui workspace-ui">');
    }
    if(name==='calendar'){
      source=replace(source,'featuresForDay.slice(0, 3).map','featuresForDay.map');
      source=replace(source,'{featuresForDay.length > 3 && (\n          <span className="block text-muted-foreground text-xs">\n            +{featuresForDay.length - 3} more\n          </span>\n        )}','');
      source=replace(source,'relative aspect-square overflow-hidden border-t border-r','relative min-h-28 overflow-auto border-t border-r');
      source=replace(source,'<Button onClick={handlePreviousMonth}','<Button aria-label="上个月" onClick={handlePreviousMonth}');
      source=replace(source,'<Button onClick={handleNextMonth}','<Button aria-label="下个月" onClick={handleNextMonth}');
    }
    if(name==='gantt'){
      // Read-only timeline: upstream still drags a bar without onMove, changing only local dates.
      source=replace(source,'const GanttContext = createContext','export const GanttContext = createContext');
      source=replace(source,'  children?: ReactNode;\n};\n\nexport const GanttFeatureItemCard','  children?: ReactNode;\n  disabled?: boolean;\n};\n\nexport const GanttFeatureItemCard');
      source=replace(source,'  id,\n  children,\n}) => {\n  const [, setDragging]','  id,\n  children,\n  disabled,\n}) => {\n  const [, setDragging]');
      source=replace(source,'useDraggable({ id });','useDraggable({ id, disabled });');
      source=replace(source,'<GanttFeatureItemCard id={feature.id}>','<GanttFeatureItemCard id={feature.id} disabled={!onMove}>');
      source=replace(source,'export type GanttProviderProps = {','export type GanttProviderProps = {\n  initialDate?: Date;');
      source=replace(source,'  zoom = 100,\n  range = "monthly",','  zoom = 100,\n  initialDate = new Date(),\n  range = "monthly",');
      source=replace(source,'createInitialTimelineData(new Date())','createInitialTimelineData(initialDate)');
      source=replace(source,'const newWidth = sidebarElement ? 300 : 0;','const newWidth = sidebarElement?.getBoundingClientRect().width ?? 0;');
      source=replace(source,'>Issues</p>','>待办</p>');source=replace(source,'>Duration</p>','>截止时间</p>');
      source=replace(source,'{duration}</p>','{formatDate(feature.endAt, "MM-dd HH:mm")}</p>');
      source=replace(source,'const label = "Today";','const label = "今天";');
      source=replace(source,'behavior: "smooth"','behavior: "auto"');
      source=source.replaceAll('"MMMM yyyy"','"yyyy 年 M 月"').replaceAll('"MMMM"','"M 月"').replaceAll('"MMM"','"M 月"');
    }
    fs.writeFileSync(path.join(output,`${name}.tsx`),source);
  }
  return {alias:{
    '@workspace':path.resolve(output),
    '@workspace-ui':path.join(root,'packages/shadcn-ui/components/ui'),
    '@repo/shadcn-ui':path.join(root,'packages/shadcn-ui'),
  },root};
}
