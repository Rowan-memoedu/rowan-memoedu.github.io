import {finalizeReaderDocument} from './reader-document.mjs';

/** The only markup boundary, used for static and delivered reader content. */
export function parseReaderMarkup({document:doc,purifier,html}){
  if(typeof html!=='string')throw Error('页面响应无效');
  const template=doc.createElement('template');
  // DOMPurify trims attribute whitespace. Source labels are inert plain text
  // and must remain byte-faithful to the same document/attachment identity.
  const labels=new WeakMap();
  purifier.addHook('beforeSanitizeAttributes',node=>{if(node.hasAttribute?.('data-node-label'))labels.set(node,node.getAttribute('data-node-label'));});
  purifier.addHook('afterSanitizeAttributes',node=>{if(labels.has(node)&&node.hasAttribute('data-node-label'))node.setAttribute('data-node-label',labels.get(node));});
  try{template.innerHTML=purifier.sanitize(html,{ADD_ATTR:['target'],FORBID_TAGS:['script','style','link','meta','base','iframe','object','embed','form','input']});}
  finally{purifier.removeHook('beforeSanitizeAttributes');purifier.removeHook('afterSanitizeAttributes');}
  for(const link of template.content.querySelectorAll('a[target="_blank"]'))link.rel='noopener noreferrer';
  for(const element of template.content.querySelectorAll('[style]')){
    const declarations=[];
    if(element.closest('.katex')||element.matches('svg.external-icon'))for(const property of Array.from(element.style)){
      const value=element.style.getPropertyValue(property).trim();
      if(/^(?:top|bottom|left|right|height|width|min-width|max-width|max-height|margin(?:-left|-right|-top|-bottom)?|padding(?:-left|-right|-top|-bottom)?|vertical-align|font-size|border-(?:top|bottom|left|right)-width)$/u.test(property)&&/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:em|ex|px|%)?$/u.test(value))declarations.push(property+':'+value);
    }
    element.removeAttribute('style');if(declarations.length)element.setAttribute('style',declarations.join(';'));
  }
  finalizeReaderDocument(template.content);
  return template.content;
}
