/** Bind source node identities to ordinary reader links without duplicate IDs. */
export function prepareSearchPreview(container,context={}){
  const doc=container.ownerDocument;
  const destination=context.href??('/blog/'+(context.slug==='index'?'':context.slug??''));
  const nodeHref=id=>destination.split('#')[0]+'#'+id;
  for(const root of container.querySelectorAll('.reading-outline')){
    root.removeAttribute('data-ready');root.querySelector(':scope > .outline-toolbar')?.remove();
    for(const node of root.querySelectorAll('.outline-node')){
      const id=node.dataset.searchNodeId??node.id;if(!id)continue;
      node.dataset.searchNodeId=id;node.removeAttribute('id');node.hidden=!!node.dataset.parentReference;
      node.classList.remove('focus-ancestor','is-focused','is-folded');
      const current=id===root.dataset.documentTitleSource;
      node.classList.toggle('document-current',current);
      const content=node.querySelector(':scope > .node-content');if(!content)continue;
      content.classList.toggle('document-title',current);
      if(['draft','protected'].includes(node.dataset.publicationState)||node.dataset.readerAccess||node.dataset.readerEditable==='true'){
        const walker=doc.createTreeWalker(content,doc.defaultView.NodeFilter.SHOW_TEXT);let text;
        while((text=walker.nextNode()))if(text.nodeValue.trim()){
          text.nodeValue=text.nodeValue.replace(/^(\s*(?:(?:\*\*|__|==|\*|_|`)[ \t]*)*)(?:\\?[#%])+\s*/u,'$1');break;
        }
      }
      node.querySelector(':scope > .outline-controls')?.remove();
      if(node.dataset.layoutOnly==='true')continue;
      const controls=doc.createElement('span');controls.className='outline-controls';controls.hidden=current;
      const children=node.querySelector(':scope > .document-body, :scope > ul');
      if(children){
        children.hidden=false;children.inert=false;children.removeAttribute('inert');children.removeAttribute('aria-hidden');
        const fold=doc.createElement('button');fold.type='button';fold.className='fold-button';
        const update=()=>{fold.textContent=children.hidden?'▸':'▾';fold.setAttribute('aria-expanded',String(!children.hidden));fold.setAttribute('aria-label',children.hidden?'展开子级':'折叠子级');fold.title=fold.getAttribute('aria-label');};
        fold.onclick=()=>{children.hidden=!children.hidden;children.toggleAttribute('inert',children.hidden);node.classList.toggle('is-folded',children.hidden);update();};update();controls.append(fold);
      }else{const space=doc.createElement('span');space.className='search-fold-space';controls.append(space);}
      const link=doc.createElement('a'),documentType=['document','dailyDocument'].includes(node.dataset.remType),number=node.dataset.listNumber;
      link.href=nodeHref(id);link.className='node-focus'+(number?' numbered-focus':documentType?' document-focus':'');
      link.textContent=documentType&&(node.dataset.readerAccess==='invitation'||node.dataset.publicationState==='protected')?(node.dataset.contentState==='unavailable'||node.dataset.publicationState==='protected'?'🔒':'🔓'):documentType&&node.dataset.publicationState==='draft'?'🖊️':number?number+'.':documentType?'📄':'·';
      link.setAttribute('aria-label','聚焦此节点');link.title='打开此节点';controls.append(link);node.prepend(controls);
      for(const open of node.querySelectorAll(':scope > .document-body [data-protected-open]')){
        if(open.closest('.outline-node')!==node)continue;
        const a=doc.createElement('a');a.href=nodeHref(id);a.textContent='打开页面';open.replaceWith(a);
      }
    }
  }
  for(const link of container.querySelectorAll('a[href^="#"]'))if(link.namespaceURI==='http://www.w3.org/1999/xhtml')link.href=nodeHref(link.getAttribute('href').slice(1));
  const refs=new Map(),win=doc.defaultView,prefix='search-svg-'+(win.personalSearchSvgNamespace=(win.personalSearchSvgNamespace??0)+1)+'-';
  for(const e of [container,...container.querySelectorAll('[id]')])if(e.id){
    const id=e.id;e.dataset.searchNodeId??=id;
    if(e.namespaceURI==='http://www.w3.org/2000/svg'){refs.set(id,prefix+id);e.id=prefix+id;}else e.removeAttribute('id');
  }
  for(const e of container.querySelectorAll('svg,svg *'))for(const attribute of ['href','xlink:href','clip-path','mask','filter','fill','stroke','marker-start','marker-mid','marker-end','style']){
    const value=e.getAttribute(attribute);if(!value)continue;
    if(value.startsWith('#')&&refs.has(value.slice(1)))e.setAttribute(attribute,'#'+refs.get(value.slice(1)));
    else e.setAttribute(attribute,value.replace(/url\(#([^)]*)\)/gu,(all,id)=>refs.has(id)?'url(#'+refs.get(id)+')':all));
  }
}

/** A projection of the reader's canonical tree. No content requests or body cache. */
export function attachSearchPreview(reader,{window:win=window}={}){
  const doc=win.document,originals=new WeakMap(),contexts=new WeakMap();
  let epoch=0;
  function project(container,context){
    const view=originals.get(container).cloneNode(true);reader.content.project(view);
    container.replaceChildren(...view.childNodes);
    prepareSearchPreview(container,context);
    win.dispatchEvent(new win.CustomEvent('personal-code-blocks-changed',{detail:{container}}));
    container.dispatchEvent(new win.CustomEvent('personal-search-preview-changed',{bubbles:true}));
  }
  async function render(container,context){
    if(!originals.has(container))originals.set(container,container.cloneNode(true));
    contexts.set(container,context);const generation=epoch;
    project(container,context);
    await reader.ready;
    if(generation===epoch&&context.isCurrent())project(container,context);
  }
  const changed=()=>{
    epoch++;
    for(const node of doc.querySelectorAll('.preview-inner[data-search-slug]')){
      const context=contexts.get(node);if(context)void render(node,context);
    }
  };
  const abort=()=>{epoch++;};
  win.personalWebsiteSearchPreview=render;
  win.addEventListener('personal-session-changed',changed);
  win.addEventListener('personal-reader-content-changed',changed);
  win.addEventListener('personal-search-closed',abort);
  return {render,dispose(){abort();win.removeEventListener('personal-session-changed',changed);win.removeEventListener('personal-reader-content-changed',changed);win.removeEventListener('personal-search-closed',abort);delete win.personalWebsiteSearchPreview;}};
}
