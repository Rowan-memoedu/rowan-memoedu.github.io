import {finalizeReaderDocument} from './reader-document.mjs';

/** One validation boundary for reader and search preview private HTML. */
export function parseProtectedDocument({document:doc,purifier,payload,id}){
  if(payload.id!==id||typeof payload.html!=='string'||!Array.isArray(payload.files))throw Error('页面响应无效');
  const template=doc.createElement('template');
  template.innerHTML=purifier.sanitize(payload.html,{FORBID_TAGS:['script','style','link','meta','base','iframe','object','embed','form','input']});
  const replacement=template.content.firstElementChild;
  if(template.content.children.length!==1||replacement?.id!=='node-'+id||!replacement.matches('li.outline-node'))throw Error('页面响应无效');
  for(const element of replacement.querySelectorAll('[src],[srcset]')){
    if(!element.hasAttribute('data-private-asset'))throw Error('私密页面包含未授权的远程资源');
  }
  for(const element of replacement.querySelectorAll('svg image,svg use,svg feImage')){
    const href=element.getAttribute('href')??element.getAttributeNS('http://www.w3.org/1999/xlink','href');
    if(href&&!href.startsWith('#')&&!element.hasAttribute('data-private-asset'))throw Error('私密页面包含未授权的远程资源');
  }
  // KaTeX's generated dimensions are part of ordinary rendering. Keep only
  // inert numeric layout declarations; arbitrary CSS and resource URLs fail closed.
  for(const element of replacement.querySelectorAll('[style]')){
    const declarations=[];
    if(element.closest('.katex')||element.matches('svg.external-icon'))for(const property of Array.from(element.style)){
      const value=element.style.getPropertyValue(property).trim();
      if(/^(?:top|bottom|left|right|height|width|min-width|max-width|max-height|margin(?:-left|-right|-top|-bottom)?|padding(?:-left|-right|-top|-bottom)?|vertical-align|font-size|border-(?:top|bottom|left|right)-width)$/u.test(property)&&/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:em|ex|px|%)?$/u.test(value))declarations.push(property+':'+value);
    }
    element.removeAttribute('style');if(declarations.length)element.setAttribute('style',declarations.join(';'));
  }
  finalizeReaderDocument(replacement);
  return replacement;
}
