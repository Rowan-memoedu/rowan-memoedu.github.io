/** Final reader contract, shared by static output and authorized fragments. */
export function finalizeReaderDocument(root){
  if(!root)return;
  for(const link of root.querySelectorAll('a.internal[href]')){
    const href=link.getAttribute('href');
    if(href.startsWith('#'))continue;
    // Both transports use the same website-root routes and Quartz link classes.
    const match=/^(?:\.\/|\/blog\/)?([a-z0-9-]+)(?:\.html)?([?#].*)?$/u.exec(href);
    if(!match)continue;
    link.setAttribute('href','/blog/'+match[1]+(match[2]??''));
    link.className=[...new Set([...link.classList,'internal','internal-link'])].join(' ');
    if(link.childNodes.length===1&&link.firstChild.nodeType===3)link.classList.add('alias');
    if(!link.classList.contains('unpublished-reference'))link.dataset.slug=match[1];
  }
}

/** One change event, retaining the outline engine and all unaffected controls. */
export function readerDocumentChanged(win,nodes=[]){
  const nodeIds=nodes.flatMap(node=>typeof node==='string'?[node]:[node.id,...[...node.querySelectorAll('.outline-node')].map(child=>child.id)]);
  win.dispatchEvent(new win.CustomEvent('personal-outline-changed',{detail:{nodeIds:[...new Set(nodeIds)]}}));
}
