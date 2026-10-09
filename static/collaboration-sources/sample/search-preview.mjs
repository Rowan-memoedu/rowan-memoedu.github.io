/** A projection of the reader's canonical tree. No content requests or body cache. */
export function attachSearchPreview(reader,{window:win=window}={}){
  const doc=win.document,originals=new WeakMap(),contexts=new WeakMap();
  let epoch=0,svgNamespace=0;
  const cleanIds=node=>{
    const refs=new Map(),prefix='search-svg-'+(++svgNamespace)+'-';
    for(const e of [node,...node.querySelectorAll('[id]')])if(e.id){
      const id=e.id;e.dataset.searchNodeId=id;
      if(e.namespaceURI==='http://www.w3.org/2000/svg'){refs.set(id,prefix+id);e.id=prefix+id;}else e.removeAttribute('id');
    }
    for(const e of node.querySelectorAll('svg *'))for(const attribute of ['href','xlink:href','clip-path','mask','filter']){
      const value=e.getAttribute(attribute);if(!value)continue;
      if(value.startsWith('#')&&refs.has(value.slice(1)))e.setAttribute(attribute,'#'+refs.get(value.slice(1)));
      else e.setAttribute(attribute,value.replace(/url\(#([^)]*)\)/gu,(all,id)=>refs.has(id)?'url(#'+refs.get(id)+')':all));
    }
  };
  function project(container,context){
    const view=originals.get(container).cloneNode(true);reader.content.project(view);
    for(const button of view.querySelectorAll('[data-protected-open]')){
      const node=button.closest('.outline-node'),link=doc.createElement('a');
      link.href='/blog/'+(context.slug==='index'?'':context.slug)+'#'+node.id;link.textContent='打开页面';button.replaceWith(link);
    }
    cleanIds(view);container.replaceChildren(...view.childNodes);
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
