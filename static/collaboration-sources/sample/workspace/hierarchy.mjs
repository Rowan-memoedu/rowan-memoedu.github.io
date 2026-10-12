import {byDeadline} from './model.mjs';
/** Source identity defines the tree. Sorting only reorders siblings. */
export function taskHierarchy(tasks){
  const present=new Set(tasks.map(t=>t.id)),children=new Map();
  for(const task of tasks){const parent=present.has(task.parentTaskId)?task.parentTaskId:null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(task);}
  const result=[],seen=new Set();
  function visit(parent,depth){for(const task of [...(children.get(parent)??[])].sort(byDeadline)){if(seen.has(task.id))continue;seen.add(task.id);result.push({...task,depth});visit(task.id,depth+1);}}
  visit(null,0);return result;
}
