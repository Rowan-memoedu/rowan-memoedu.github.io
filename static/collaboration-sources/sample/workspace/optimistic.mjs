/** Only pending local intentions are projected; the API remains authoritative. */
export function optimisticSnapshot(snapshot,pending){
  if(!snapshot)return snapshot;
  const relevant=pending.filter(item=>item.projectId===snapshot.projectId);
  if(!relevant.length)return snapshot;
  return {...snapshot,tasks:snapshot.tasks.map(task=>relevant.reduce((value,item)=>item.taskId===task.id?{...value,...item.fields}:value,task))};
}
