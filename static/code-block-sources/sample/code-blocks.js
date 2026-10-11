/* Adapted from @quartz-community/syntax-highlighting 0.1.0 clipboard.inline.ts (MIT).
 * Original component and license: sample/upstream/code-blocks. Source text is never normalized.
 */
(() => {
  if(window.personalCodeBlocks)return;
  const copyIcon='<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16"><path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path></svg>';
  const lifecycle=new AbortController();
  const resetTimers=new Set();
  function state(button,next){
    button.dataset.state=next;
    button.disabled=next==='loading'||next==='disabled';
    button.setAttribute('aria-busy',String(next==='loading'));
    button.setAttribute('aria-label',next==='error'?'复制失败，点击重试':next==='success'?'代码已复制':'复制代码');
    button.querySelector('.code-copy-label').textContent={default:'复制',loading:'复制中',error:'重试',success:'已复制',disabled:'复制'}[next];
    const status=button.parentElement.querySelector(':scope > .code-copy-status');
    if(status)status.textContent=next==='error'?'复制失败，请重试或选中代码手动复制。':next==='success'?'代码已复制。':'';
  }
  function mount(container=document){
    for(const pre of container.querySelectorAll('pre')){
      if(!pre.closest('.reading-outline'))continue;
      const code=pre.querySelector(':scope > code');if(!code||pre.querySelector(':scope > [data-code-copy]'))continue;
      const button=document.createElement('button');button.type='button';button.className='clipboard-button code-copy';button.dataset.codeCopy='';
      button.innerHTML=copyIcon+'<span class="code-copy-label"></span>';
      const status=document.createElement('span');status.className='code-copy-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      pre.prepend(button);pre.append(status);state(button,code.textContent.length?'default':'disabled');
    }
  }
  async function write(text){
    try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(text);return;}
    catch{
      const active=document.activeElement,selection=window.getSelection(),ranges=selection?[...Array(selection.rangeCount)].map((_,i)=>selection.getRangeAt(i).cloneRange()):[];
      const field=document.createElement('textarea');field.className='code-copy-fallback';field.value=text;field.setAttribute('readonly','');field.setAttribute('aria-label','待复制代码');document.body.append(field);
      try{field.select();if(!document.execCommand?.('copy'))throw Error('Copy failed');}
      finally{field.remove();if(active?.isConnected)active.focus({preventScroll:true});if(selection){selection.removeAllRanges();for(const range of ranges)selection.addRange(range);}}
    }
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-code-copy]');if(!button||button.disabled||!button.closest('.reading-outline'))return;
    event.preventDefault();event.stopPropagation();
    const code=button.parentElement.querySelector(':scope > code');if(!code)return;
    state(button,'loading');
    try{await write(code.textContent);if(button.isConnected)state(button,'success');}
    catch{if(button.isConnected)state(button,'error');}
    if(button.isConnected&&button.dataset.state==='success'){
      const timer=setTimeout(()=>{resetTimers.delete(timer);if(button.isConnected)state(button,'default');},2000);resetTimers.add(timer);
    }
  },{signal:lifecycle.signal});
  const changed=event=>{
    const ids=event.detail?.nodeIds;
    if(Array.isArray(ids)){
      const nodes=ids.map(id=>document.getElementById(id)).filter(Boolean),selected=new Set(nodes);
      for(const node of nodes){let parent=node.parentElement;while(parent&&!selected.has(parent))parent=parent.parentElement;if(!parent)mount(node);}
    }
    else mount(event.detail?.container??document);
  };
  window.addEventListener('personal-outline-changed',changed,{signal:lifecycle.signal});
  window.addEventListener('personal-code-blocks-changed',changed,{signal:lifecycle.signal});
  window.personalCodeBlocks={mount,dispose(){lifecycle.abort();for(const timer of resetTimers)clearTimeout(timer);delete window.personalCodeBlocks;}};
  mount();
})();
