import {attachProtectedReader} from './reader-access.mjs';
import {attachSearchPreview} from './search-preview.mjs';
export {attachProtectedReader};

if(typeof window!=='undefined'){
  const start=async()=>{
    const response=await fetch('/static/private-backend.json',{credentials:'omit',cache:'no-store'});
    if(!response.ok)throw Error('读取登录配置失败');const config=await response.json();const reader=attachProtectedReader({apiBase:config.apiBase});attachSearchPreview(reader);
    const {attachCollaboration}=await import('./collaboration/controller.mjs');attachCollaboration(reader);
    if(document.getElementById('workspace-root')){const {attachWorkspace}=await import('./workspace/app');attachWorkspace(reader);}
    if(document.getElementById('edit-review-root')){const {attachEditReview}=await import('./collaboration/review');attachEditReview(reader);}
  };
  const run=()=>void start().catch(()=>{const workspace=document.getElementById('workspace-root')??document.getElementById('edit-review-root');if(workspace){workspace.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='页面暂时无法加载，请刷新重试。';workspace.append(message);}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
}
