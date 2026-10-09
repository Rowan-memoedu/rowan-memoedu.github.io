import {attachProtectedReader} from './reader-access.mjs';
import {attachSearchPreview} from './search-preview.mjs';
export {attachProtectedReader};

if(typeof window!=='undefined'){
  const start=async()=>{
    const response=await fetch('/static/private-backend.json',{credentials:'omit',cache:'no-store'});
    if(!response.ok)return;const config=await response.json();const reader=attachProtectedReader({apiBase:config.apiBase});attachSearchPreview(reader);
    const {attachCollaboration}=await import('./collaboration/controller.mjs');attachCollaboration(reader);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void start());else void start();
}
