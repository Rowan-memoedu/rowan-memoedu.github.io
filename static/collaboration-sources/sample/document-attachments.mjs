import {escapeSiteText as escape,isDocumentRem} from './document-model.mjs';
import {resourceFormat,resourceMimeTypes} from './resource-format.mjs';

export function documentAttachmentHref(item){
  const format=resourceFormat(item);
  if(!/^[a-f0-9]{64}$/.test(item.sha256)||!Object.hasOwn(resourceMimeTypes,format))throw Error('Invalid document attachment identity');
  return '/blog/attachments/'+item.sha256+'.'+format;
}

// Reuse the Resources native new-tab view. Only formats with a browser viewer
// receive a preview affordance; Office/archive and download-oriented text MIME
// types retain the download action without promising a rendered preview.
const nativePreviewFormats=new Set(['pdf','png','jpg','jpeg','gif','webp','svg','txt','json','wav','mp3','mp4','webm']);
export const documentAttachmentCanPreview=item=>nativePreviewFormats.has(resourceFormat(item));

// Quartz resolves links relative to its Blog content root. Attachments live at
// a website-root route, so restore only these generated file actions when the
// shared shell mounts the finished Quartz output. Source links stay untouched.
export function mountDocumentAttachmentLinks(document){
  for(const link of document.querySelectorAll('.document-attachments a[data-document-attachment-preview],.document-attachments a[data-document-attachment-download]')){
    const match=/^(?:\/|(?:\.\.?\/)*)blog\/attachments\/([a-f0-9]{64})\.([a-z0-9]+)$/.exec(link.getAttribute('href')??'');
    if(!match||!Object.hasOwn(resourceMimeTypes,match[2]))throw Error('Invalid generated document attachment route');
    link.setAttribute('href',documentAttachmentHref({sha256:match[1],format:match[2]}));
    link.classList.remove('internal','internal-link','alias');
    link.removeAttribute('data-slug');
  }
}

// Reuse Quartz's existing right-sidebar/backlinks heading and spacing. Move
// each source-bound list rather than cloning it, so a document has one list
// even when the same page contains several focusable document branches.
export function mountDocumentAttachmentSidebar(document,{append=false}={}){
  const root=document.querySelector('.reading-outline');if(!root)return;
  const sections=[...root.querySelectorAll('.document-attachments')];
  if(!sections.length)return;
  const right=document.querySelector('.sidebar.right');
  if(!right)throw Error('Document attachments require the reader right sidebar');
  const existing=right.querySelector('[data-document-attachment-sidebar]');
  if(existing&&!append)throw Error('Document attachment sidebar was already mounted');
  const sidebar=existing??document.createElement('div');
  sidebar.className='backlinks document-attachment-sidebar';sidebar.setAttribute('data-document-attachment-sidebar','');
  sidebar.setAttribute('role','complementary');sidebar.setAttribute('aria-label','附件');
  if(!existing){const heading=document.createElement('h3');heading.textContent='附件';sidebar.append(heading);}
  const seen=new Set(),current=root.dataset.documentTitleSource;
  for(const section of sections){
    const id=section.dataset.documentAttachmentsFor,owner=section.parentElement;
    if(!id||seen.has(id)||owner?.id!=='node-'+id||!['document','dailyDocument'].includes(owner.dataset.remType)||owner.dataset.publicationState==='draft')throw Error('Invalid attachment sidebar document owner');
    seen.add(id);section.hidden=owner.id!==current;sidebar.append(section);
  }
  sidebar.hidden=![...sidebar.querySelectorAll('.document-attachments')].some(section=>!section.hidden);
  if(!sidebar.hidden)sidebar.dataset.attachmentContext=current;
  if(!existing){const backlinks=right.querySelector(':scope > .backlinks');backlinks?backlinks.after(sidebar):right.append(sidebar);}
}

// Bind Resources' original-file view and download links to a compact native
// ordered list. The mounting adapter places it below the right-sidebar heading.
export function renderDocumentAttachments(node,files=[],resolveHref=documentAttachmentHref){
  if(!isDocumentRem(node)||node.published===false||node.publicationState==='draft'||!files?.length)return '';
  const rows=files.map((item,index)=>{
    const href=escape(resolveHref(item)),fileName=escape(item.fileName),format=escape(resourceFormat(item).toUpperCase());
    const name='<span data-document-attachment-name>'+fileName+'</span>';
    const view=documentAttachmentCanPreview(item)?'<a href="'+href+'" target="_blank" rel="noopener noreferrer" data-document-attachment-preview aria-label="预览 '+format+'：'+fileName+'">'+name+'</a>':name;
    return '<li data-document-attachment-index="'+(index+1)+'"><span class="document-attachment-icon" aria-hidden="true">📎</span>'+view+'<span class="periodical document-attachment-type" data-document-attachment-type>'+format+'</span><a class="document-attachment-download" href="'+href+'" download="'+fileName+'" data-document-attachment-download aria-label="下载 '+fileName+'">下载</a>'+(documentAttachmentCanPreview(item)?'':'<span class="periodical document-attachment-download-only" data-document-attachment-download-only>仅下载</span>')+'</li>';
  }).join('');
  return '<section class="document-attachments" data-document-attachments-for="'+escape(node.id)+'" aria-label="附件"><ol class="document-attachment-list">'+rows+'</ol></section>';
}
