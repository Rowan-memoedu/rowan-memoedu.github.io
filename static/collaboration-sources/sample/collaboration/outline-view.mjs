// Reader presentation only. Full source identities remain in the editor model
// and on the server; focusing never changes the saved tree or permissions.
import {hasDocumentSuffix,isDocumentRem} from '../document-model.mjs';
export const routeNodeId=hash=>hash?.startsWith('#node-')?hash.slice(6):null;
export function plateOutlineNodes(value){
  return value.flatMap(node=>node.type==='ul'||node.type==='ol'?plateOutlineNodes(node.children):node.type==='li'?[{id:node.id,children:plateOutlineNodes(node.children)}]:[]);
}

export function outlineView(nodes,requested,{inlineRoot=false,metadata={},scopeId=null,editableIds=[],originalIds=[]}={}){
  const parents=new Map(),items=new Map();
  const visit=(nodes,parent=null)=>{for(const node of nodes){items.set(node.id,node);parents.set(node.id,parent);visit(node.children??[],node.id);}};
  visit(nodes);
  const editable=new Set(editableIds),originals=new Set(originalIds);
  const domain=new Set();
  const include=node=>{if(!node||domain.has(node.id))return;domain.add(node.id);for(const child of node.children??[])include(child);};
  if(scopeId){include(items.get(scopeId));for(const id of items.keys())if(editable.has(id)||!originals.has(id))include(items.get(id));}
  else for(const id of items.keys())domain.add(id);
  const active=domain.has(requested)?requested:inlineRoot&&!scopeId?nodes[0]?.id:null;
  const ancestors=new Set();let parent=parents.get(active);
  while(parent){ancestors.add(parent);parent=parents.get(parent);}
  if(!active&&scopeId)for(const id of domain){let parent=parents.get(id);while(parent){if(!domain.has(parent))ancestors.add(parent);parent=parents.get(parent);}}
  const descendants=new Set();if(active)visitDescendants(items.get(active));
  function visitDescendants(node){descendants.add(node.id);for(const child of node.children??[])visitDescendants(child);}
  return new Map([...items.keys()].map(id=>[id,{
    hidden:(!active&&!domain.has(id)&&!ancestors.has(id))||!!active&&!ancestors.has(id)&&!descendants.has(id)||!!metadata[id]?.parentReference&&id!==active,
    ancestor:ancestors.has(id),current:id===active,
  }]));
}

export function canAdoptOutlineNode(outline,id,parentId){
  if(!outline)return true;
  const original=outline.originalIds.includes(id);
  if(original&&!outline.editableIds.includes(id))return false;
  return id===outline.documentId||outline.originalIds.includes(parentId);
}
export function documentViewSplit(items,metadata){
  const source=items.map(item=>({remType:metadata[item.id]?.remType??'text'}));
  return hasDocumentSuffix(source)?source.findIndex(isDocumentRem):-1;
}
