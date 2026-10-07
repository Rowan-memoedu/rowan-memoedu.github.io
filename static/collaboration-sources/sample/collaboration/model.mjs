// A small wire adapter; editor-only attributes and HTML never reach the API.
const uid=()=>crypto.randomUUID();
export function toInline(runs){
  return runs.map(r=>'text'in r?{...r}:r.type==='mention'?{type:'mention',id:r.id,key:r.userId,value:r.label,children:[{text:''}]}:r.type==='link'?{type:'a',url:r.url,children:toInline(r.children)}:{type:'inline_equation',texExpression:r.tex,display:r.display,children:[{text:''}]});
}
export function fromInline(children){
  const runs=children.map(n=>{
    if(typeof n.text==='string')return Object.fromEntries(['text','bold','italic','code'].filter(k=>k in n).map(k=>[k,n[k]]));
    if(n.type==='mention'){
      if(!n.id||!n.key)throw Error('@ 标记尚未完成，请重新选择用户');
      return {type:'mention',id:n.id,userId:n.key,label:n.value};
    }
    if(n.type==='mention_input')throw Error('请先完成或取消 @ 选择');
    if(n.type==='a')return {type:'link',url:n.url,children:fromInline(n.children)};
    if(n.type==='inline_equation')return {type:'math',tex:n.texExpression??'',display:!!n.display};
    throw Error('首版仅支持文字、基本格式、链接、公式与 @');
  });
  return runs.length?runs:[{text:''}];
}
export function toTree(nodes){
  return [{type:'ul',id:uid(),children:nodes.map(n=>({type:'li',id:n.id,children:[{type:'lic',id:uid(),children:toInline(n.content)},...(n.children.length?toTree(n.children):[])]}))}];
}
export function fromTree(value){
  const result=[];
  for(const n of value){
    if(n.type==='ul'||n.type==='ol'){result.push(...fromTree(n.children));continue;}
    if(!n.id)throw Error('节点尚未完成初始化');
    if(n.type==='li'){
      const line=n.children.find(c=>c.type==='lic');
      if(!line)throw Error('节点内容无效');
      result.push({id:n.id,content:fromInline(line.children),children:fromTree(n.children.filter(c=>c.type==='ul'||c.type==='ol'))});
    }else if(n.type==='p')result.push({id:n.id,content:fromInline(n.children),children:[]});
    else throw Error('请使用大纲子节点');
  }
  return result;
}
export const toComment=runs=>[{type:'p',id:uid(),children:toInline(runs)}];
export function fromComment(value){
  return value.flatMap((block,index)=>[...(index?[{text:'\n'}]:[]),...fromInline(block.children)]);
}
export const textOf=runs=>runs.map(r=>'text'in r?r.text:r.type==='mention'?'@'+r.label:r.type==='math'?r.tex:textOf(r.children)).join('');

/** One request in flight. Lost responses reuse the same UUID and exact body. */
export class Autosave {
  constructor({proposal,send,onState,onSaved}){Object.assign(this,{revision:proposal.revision,proposalId:proposal.id,send,onState,onSaved});this.current=proposal.nodes;this.saved=JSON.stringify(proposal.nodes);this.alive=true;}
  change(nodes){this.current=nodes;this.onState('unsaved');clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush(),650);}
  async flush(){
    clearTimeout(this.timer);if(!this.alive||this.conflict)return false;
    if(this.running){await this.running;return this.flush();}
    if(!this.pending&&JSON.stringify(this.current)===this.saved){this.onState('saved');return true;}
    this.pending??={requestId:uid(),proposalId:this.proposalId,revision:this.revision,nodes:structuredClone(this.current)};
    const request=this.pending;this.onState('saving');
    this.running=(async()=>{
      try{
        const value=await this.send(request);if(!this.alive)return;
        this.revision=value.revision;this.saved=JSON.stringify(request.nodes);this.pending=null;this.onSaved(value);
        this.onState(JSON.stringify(this.current)===this.saved?'saved':'unsaved');
      }catch(error){if(!this.alive)return;if(error.status===409){this.conflict=true;this.onState('conflict',error);}else this.onState('error',error);}
    })();
    await this.running;this.running=null;
    if(!this.alive||this.pending||this.conflict)return false;
    if(JSON.stringify(this.current)!==this.saved)return this.flush();
    return true;
  }
  dispose(){this.alive=false;clearTimeout(this.timer);}
}
