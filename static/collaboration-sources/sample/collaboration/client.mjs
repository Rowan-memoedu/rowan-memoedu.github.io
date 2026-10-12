/** The same session epoch, request and mention contract on both reading surfaces. */
export function createCollaborationClient(session,{guard=()=>{}}={}){
  const epoch=session.epoch;
  async function request(route,body){
    const valid=()=>{guard();if(!session.authenticated||session.epoch!==epoch)throw new DOMException('登录状态已改变','AbortError');};
    valid();
    const result=await(await session.request('/collaboration/'+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})).json();
    valid();return result;
  }
  return {user:session.user,get:route=>request(route),post:request,users:context=>request('mentions?'+new URLSearchParams(Object.entries(context).filter(([,v])=>v!==undefined)))};
}
