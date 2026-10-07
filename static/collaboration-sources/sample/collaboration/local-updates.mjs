import DOMPurify from 'dompurify';

/** Reversible, session-only views of verified local writes. No persistent body cache. */
export function createLocalUpdates(win){
  const doc=win.document,purifier=DOMPurify.sanitize?DOMPurify:DOMPurify(win),applied=new Map();
  const changed=ids=>win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:[...new Set(ids)]}}));
  function parse(fragment){
    if(!/^r-(?:[a-f0-9]{2})+$/u.test(fragment.nodeId)||typeof fragment.html!=='string')throw Error('局部节点响应无效');
    const template=doc.createElement('template');
    template.innerHTML=purifier.sanitize(fragment.html,{FORBID_TAGS:['script','iframe','object','embed','form','input','img','video','audio'],FORBID_ATTR:['style']});
    const node=template.content.firstElementChild;
    if(template.content.children.length!==1||!node.matches('li.outline-node')||node.id!=='node-'+fragment.nodeId||!node.querySelector(':scope > .node-content'))throw Error('局部节点身份无效');
    for(const child of node.querySelectorAll('.outline-node'))if(!/^node-r-(?:[a-f0-9]{2})+$/u.test(child.id))throw Error('局部子节点身份无效');
    return node;
  }
  function childList(parent,undo){
    let list=parent.querySelector(':scope > ul, :scope > .document-body > ul, :scope > .document-body > .document-annotations > .callout-content > ul');
    if(list)return list;
    let container=parent.querySelector(':scope > .document-body')??parent;
    if(parent.dataset.documentLayout==='split'){
      const aside=doc.createElement('aside');aside.className='document-annotations callout';aside.dataset.callout='note';aside.setAttribute('aria-label','母节点注解，可在框内上下滚动');aside.tabIndex=0;
      const content=doc.createElement('div');content.className='callout-content';aside.append(content);container.prepend(aside);container=content;undo.push(()=>{if(!content.children.length)aside.remove();});
    }
    list=doc.createElement('ul');container.append(list);undo.push(()=>{if(!list.children.length)list.remove();});return list;
  }
  function remove(anchorId){
    const ids=[];
    for(const [key,entry] of [...applied].reverse())if(!anchorId||entry.anchorId===anchorId){for(const undo of entry.undo.reverse())undo();ids.push(...entry.ids);applied.delete(key);}
    if(ids.length)changed(ids);
  }
  function apply(anchorId,updates){
    const anchor=doc.getElementById('node-'+anchorId);if(!anchor)return;
    const keys=new Set(updates.map(update=>update.id));
    if([...applied].some(([key,entry])=>entry.anchorId===anchorId&&!keys.has(key)))remove(anchorId);
    for(const update of updates){
      if(applied.has(update.id))continue;
      const parsed=update.fragments.map(parse),undo=[],ids=[];
      try{
        for(const node of parsed){
          const existing=doc.getElementById(node.id);
          if(update.kind==='edit'){
            if(!existing||existing!==anchor)throw Error('修改目标不属于当前节点');
            const content=existing.querySelector(':scope > .node-content'),incoming=node.querySelector(':scope > .node-content');
            const controls=[...content.children].filter(n=>n.matches('.collaboration-actions'));
            const original=[...content.childNodes].filter(n=>!controls.includes(n)),label=content.dataset.nodeLabel;
            original.forEach(n=>n.remove());content.prepend(...incoming.childNodes);content.dataset.nodeLabel=incoming.dataset.nodeLabel;
            undo.push(()=>{for(const n of [...content.childNodes])if(!controls.includes(n))n.remove();content.prepend(...original);content.dataset.nodeLabel=label;});
            ids.push(existing.id);
            for(const child of [...(node.querySelector(':scope > ul')?.children??[])])insert(existing,child,undo,ids);
          }else{
            const parent=doc.getElementById('node-'+update.parentId);
            if(!parent||parent!==anchor&&!anchor.contains(parent))throw Error('新增节点父级无效');
            insert(parent,node,undo,ids);
          }
        }
        applied.set(update.id,{anchorId,undo,ids});changed(ids);
      }catch(error){for(const revert of undo.reverse())revert();changed(ids);throw error;}
    }
  }
  function insert(parent,node,undo,ids){
    // An already published identity must not be duplicated or overwritten.
    if(doc.getElementById(node.id))return;
    const descendants=[node,...node.querySelectorAll('.outline-node')];
    if(descendants.some(n=>doc.getElementById(n.id)))throw Error('新增节点与现有身份冲突');
    for(const n of descendants)n.dataset.localSynced='true';
    childList(parent,undo).append(node);undo.push(()=>node.remove());ids.push(parent.id,...descendants.map(n=>n.id));
  }
  return {apply,remove,clear:()=>remove()};
}
