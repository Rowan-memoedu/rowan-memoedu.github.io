export const statuses=[{id:'todo',name:'待办',color:'#526176'},{id:'doing',name:'进行中',color:'#0645ad'},{id:'done',name:'已完成',color:'#24704b'}];
export const dateText=value=>value?value.replace('T',' '):'未设截止时间';
// The API stores civil time in Asia/Shanghai. Calendar libraries receive those
// same civil date parts even when the browser is in a different time zone.
export const civilDate=value=>{const [y,m,d,h=0,n=0]=value.split(/[-T:]/u).map(Number);return new Date(y,m-1,d,h,n);};
export const beijingNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
export const byDeadline=(a,b)=>(a.deadline??'9999').localeCompare(b.deadline??'9999')||a.position-b.position||a.id.localeCompare(b.id);
export const overdue=(task,now=beijingNow())=>task.status!=='done'&&!!task.deadline&&task.deadline<now;
export const asFeature=task=>({id:task.id,name:task.title,startAt:civilDate(task.startAt??task.deadline),endAt:civilDate(task.deadline),deadlineLabel:task.deadline.slice(5).replace('T',' '),status:statuses.find(s=>s.id===task.status)});

export function createWorkspaceClient(reader){
  const epoch=reader.epoch,pending=new Map();
  const guard=()=>{if(reader.epoch!==epoch||!reader.authenticated)throw new DOMException('会话已改变','AbortError');};
  async function call(route,options){
    guard();const response=await reader.request('/workspace/'+route,options);
    const value=await response.json();guard();return value;
  }
  return {get:route=>call(route),async post(route,fields){
    const key=JSON.stringify([route,fields]);
    if(!pending.has(key))pending.set(key,crypto.randomUUID().replaceAll('-',''));
    try{
      const result=await call(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:pending.get(key),...fields})});
      pending.delete(key);return result;
    }catch(error){
      // Unknown transport outcomes retain their exact request identity for retry.
      if(error.status>=400&&error.status<500)pending.delete(key);
      throw error;
    }
  }};
}
