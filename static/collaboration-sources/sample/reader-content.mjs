import {readerDocumentChanged} from './reader-document.mjs';
import {mountDocumentAttachmentSidebar} from './document-attachments.mjs';

/** Canonical content, independent of authentication and transport. Views never fetch bodies. */
export function createReaderContent({window:win=window}={}){
  const doc=win.document,root=doc.querySelector('.reading-outline');
  let base=(root?.personalReaderSource??root)?.cloneNode(true)??doc.createElement('div');
  // Static mounting moved these source-owned sections to the sidebar.
  for(const section of doc.querySelectorAll('[data-document-attachment-sidebar] > .document-attachments'))base.querySelector('#node-'+section.dataset.documentAttachmentsFor)?.append(section.cloneNode(true));
  const layers=new Map(),graphs=new Map(),baseGraph=win.personalReaderGraph??{documents:{}};let index=new Map(),loader=null;
  const descendants=node=>[node,...node.querySelectorAll('.outline-node[id]')].filter(node=>node.matches('.outline-node[id]'));
  function reindex(){
    const tree=base.cloneNode(true),external=[];
    for(const nodes of layers.values())for(const node of nodes){
      const target=tree.querySelector('#'+node.id),copy=node.cloneNode(true);
      if(target)target.replaceWith(copy);else external.push(copy);
    }
    index=new Map([...tree.querySelectorAll('.outline-node[id]')].map(node=>[node.id,node]));
    for(const node of external)for(const entry of descendants(node))index.set(entry.id,entry);
  }
  reindex();
  const clone=id=>index.get(id)?.cloneNode(true)??null;
  function project(view){
    const targets=[...view.querySelectorAll('.outline-node[id]')];
    for(const target of targets)if(view.contains(target)){const node=clone(target.id);if(node)target.replaceWith(node);}
    return view;
  }
  function publish(ids){
    if(!root)return;
    const targets=ids.map(id=>doc.getElementById(id)).filter(node=>node&&root.contains(node));
    const outer=targets.filter(node=>!targets.some(parent=>parent!==node&&parent.contains(node)));
    const changed=[];
    for(const target of outer){
      const replacement=clone(target.id);if(!replacement)continue;
      const owners=new Set(descendants(target).map(node=>node.id.slice(5)));
      for(const section of doc.querySelectorAll('[data-document-attachment-sidebar] > .document-attachments'))if(owners.has(section.dataset.documentAttachmentsFor))section.remove();
      target.replaceWith(replacement);changed.push(replacement);
    }
    if(changed.length){
      if(doc.querySelector('.sidebar.right'))mountDocumentAttachmentSidebar(doc,{append:true});
      readerDocumentChanged(win,changed);
    }
    win.dispatchEvent(new win.CustomEvent('personal-reader-backlinks',{detail:{data:[...graphs.values()].at(-1)??baseGraph}}));
    win.dispatchEvent(new win.CustomEvent('personal-reader-content-changed'));
  }
  function setLayer(name,nodes,{render=true,graph=null}={}){
    const previous=layers.get(name)??[],ids=[...new Set([...previous,...nodes].map(node=>node.id))];
    if(nodes.length)layers.set(name,nodes);else layers.delete(name);
    if(graph)graphs.set(name,graph);else graphs.delete(name);
    reindex();if(render)publish(ids);
  }
  function setBase(source){base=source.cloneNode(true);reindex();}
  return {clone,project,setLayer,setBase,publish,
    available(id){const node=index.get(id);return !!node&&!node.closest('[data-content-state="unavailable"]');},
    setLoader(value){loader=value;},
    async refreshNode(id,{beforePublish}={}){if(loader)await loader();if(!index.has(id))throw Error('正式节点尚未出现在当前页面');beforePublish?.();publish([id]);},
    get size(){return index.size;}
  };
}
