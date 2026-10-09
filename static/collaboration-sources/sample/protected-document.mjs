import {parseReaderMarkup} from './reader-markup.mjs';

/** One validation boundary for reader and search preview private HTML. */
export function parseProtectedDocument({document:doc,purifier,payload,id}){
  if(payload.id!==id||typeof payload.html!=='string'||!Array.isArray(payload.files))throw Error('页面响应无效');
  const fragment=parseReaderMarkup({document:doc,purifier,html:payload.html});
  const replacement=fragment.firstElementChild;
  if(fragment.children.length!==1||replacement?.id!=='node-'+id||!replacement.matches('li.outline-node'))throw Error('页面响应无效');
  for(const element of replacement.querySelectorAll('[src],[srcset]')){
    if(!element.hasAttribute('data-private-asset'))throw Error('私密页面包含未授权的远程资源');
  }
  for(const element of replacement.querySelectorAll('svg image,svg use,svg feImage')){
    const href=element.getAttribute('href')??element.getAttributeNS('http://www.w3.org/1999/xlink','href');
    if(href&&!href.startsWith('#')&&!element.hasAttribute('data-private-asset'))throw Error('私密页面包含未授权的远程资源');
  }
  return replacement;
}
