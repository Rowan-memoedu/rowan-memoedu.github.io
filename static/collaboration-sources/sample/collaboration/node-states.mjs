import {outlineChildList} from './local-updates.mjs';
/** Session-only binding; logout restores the published DOM and its location. */
export function createNodeStates(win){
  const doc=win.document,originals=new Map(),containers=[];
  function clear(){
    const changed=[];
    for(const [node,before] of [...originals].reverse()){
      for(const [key,value] of Object.entries(before.attributes))value===undefined?delete node.dataset[key]:node.dataset[key]=value;
      node.id=before.id;
      if(node.isConnected&&before.parent?.isConnected)before.parent.insertBefore(node,before.next?.parentNode===before.parent?before.next:null);
      changed.push(node.id);
    }
    originals.clear();for(const undo of containers.reverse())undo();containers.length=0;if(changed.length)win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:changed}}));
  }
  function apply(states){
    const changed=[];
    for(const state of states){
      const node=doc.getElementById('node-'+state.nodeId)??(state.previousIds??[]).map(id=>doc.getElementById('node-'+id)).find(Boolean);if(!node||node.closest('[data-collaboration-tree]'))continue;
      if(!originals.has(node))originals.set(node,{id:node.id,parent:node.parentNode,next:node.nextSibling,attributes:Object.fromEntries(['todoState','todoEditable','collaborationArchived'].map(key=>[key,node.dataset[key]]))});
      if(node.id!=='node-'+state.nodeId){changed.push(node.id);node.id='node-'+state.nodeId;changed.push(node.id);}
      const expected={todoState:state.todoState??'',todoEditable:String(state.canEdit&&!state.archived),collaborationArchived:String(state.archived)};
      for(const [key,value] of Object.entries(expected))if(node.dataset[key]!==value){node.dataset[key]=value;changed.push(node.id);}
      const parent=state.parentId&&doc.getElementById('node-'+state.parentId),current=node.parentElement.closest('.outline-node');
      if(!state.archived&&parent&&current!==parent&&!node.contains(parent)&&!parent.closest('[data-collaboration-tree]')){
        outlineChildList(parent,containers).append(node);changed.push(node.id,parent.id);
      }
    }
    if(changed.length)win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:[...new Set(changed)]}}));
  }
  return {apply,clear};
}
