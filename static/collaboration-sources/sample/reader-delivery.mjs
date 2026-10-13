import DOMPurify from 'dompurify';
import {parseProtectedDocument} from './protected-document.mjs';
import {parseReaderMarkup} from './reader-markup.mjs';

/** Access/transport boundary. It delivers nodes; it never renders a view. */
export function createReaderDelivery({window:win,session,content,fetcher=fetch,onResources=()=>{}}){
  const doc=win.document,purifier=DOMPurify(win),root=doc.querySelector('.reading-outline');
  let epoch=0,controller=null,task=null,refreshTask=null,urls=new Set(),state='idle',accessRevision=null,resourcesTask=null,retryResources=()=>Promise.resolve();const assetCache=new Map();
  const cancelled=()=>Object.assign(Error('内容读取已取消'),{name:'AbortError'});
  const revoke=values=>{for(const url of values)win.URL.revokeObjectURL(url);};
  function clear(){
    epoch++;controller?.abort();controller=null;task=null;refreshTask=null;state='idle';
    content.setLayer('authorized',[]);revoke(urls);urls=new Set();assetCache.clear();accessRevision=null;resourcesTask=null;retryResources=()=>Promise.resolve();onResources(0);
  }
  function load({render=true,force=false,publication=root?.dataset.publicationVersion}={}){
    if(!root||!session.authenticated||session.user?.role==='reader')return Promise.resolve(false);
    const generation=epoch;
    if(task)return force?task.then(()=>{if(generation!==epoch)throw cancelled();return load({render,force,publication});}):task;if(state==='ready'&&!force)return Promise.resolve(true);
    controller?.abort();resourcesTask=null;controller=new AbortController();const signal=controller.signal;state='loading';
    const valid=()=>generation===epoch&&!signal.aborted&&session.authenticated;
    task=(async()=>{
      try{
        const payload=await(await session.request('/reader',{signal})).json();
        if(!valid())throw cancelled();
        if(payload.schema!=='website-reader-snapshot-v1'||!/^[a-f0-9]{64}$/u.test(payload.version)||!Array.isArray(payload.documents))throw Error('内容快照无效');
        if(publication&&payload.publication!==publication)throw Error('网站内容正在更新，请刷新页面后重试');
        const nodes=[],assets=new Map(),ids=new Set();
        for(const item of payload.documents){
          const node=parseProtectedDocument({document:doc,purifier,payload:item,id:item.id});
          for(const entry of [node,...node.querySelectorAll('.outline-node[id]')]){
            if(ids.has(entry.id))throw Error('内容快照存在重复节点');ids.add(entry.id);
          }
          for(const element of node.querySelectorAll('[data-private-asset]')){
            const asset=element.dataset.privateAsset;
            if(!/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/u.test(asset))throw Error('文件响应无效');
            if(!assets.has(asset))assets.set(asset,{owner:element.dataset.privateOwner??item.id,elements:[]});assets.get(asset).elements.push(element);
          }
          nodes.push(node);
        }
        // Bodies are complete and validated together. Images and attachments
        // load independently, like ordinary reader resources, never per click.
        for(const [asset,{owner,elements}] of assets){
          const url=assetCache.get(payload.version+':'+asset);
          for(const element of elements){element.removeAttribute('srcset');element.removeAttribute(element.tagName==='IMG'?'src':'href');if(url)element.setAttribute(element.tagName==='IMG'?'src':'href',url);}
        }
        if(!valid())throw cancelled();
        const updateResource=content.setLayer('authorized',nodes,{render,graph:payload.graph});state='ready';accessRevision=payload.accessRevision??null;
        const resolveResources=async()=>{
          const pending=[...assets].filter(([asset])=>!assetCache.has(payload.version+':'+asset));let next=0,failed=0;
          await Promise.all(Array.from({length:Math.min(6,pending.length)},async()=>{
            while(valid()&&next<pending.length){
              const [asset,{owner}]=pending[next++];
              try{
                const blob=await(await session.request('/documents/'+owner+'/assets/'+asset+'?version='+payload.version,{signal})).blob();
                if(!valid())return;
                const url=win.URL.createObjectURL(blob);
                if(!updateResource(asset,url)){win.URL.revokeObjectURL(url);return;}
                urls.add(url);assetCache.set(payload.version+':'+asset,url);
              }catch{if(valid())failed++;}
            }
          }));
          if(valid())onResources(failed);
        };
        retryResources=()=>{
          if(!valid())return Promise.resolve();
          if(resourcesTask)return resourcesTask;
          const current=resolveResources().finally(()=>{if(resourcesTask===current)resourcesTask=null;});resourcesTask=current;return current;
        };
        onResources(0);void retryResources();
        return true;
      }catch(error){if(valid())state='error';throw error;}
      finally{if(generation===epoch)task=null;}
    })();return task;
  }
  async function refresh(){
    const generation=epoch;
    const html=await(await fetcher('/blog/',{cache:'no-store',credentials:'omit'})).text();
    if(generation!==epoch)throw cancelled();
    const fragment=parseReaderMarkup({document:doc,purifier,html}),base=fragment.querySelector('.reading-outline');
    if(!base)throw Error('页面内容暂不可用');
    // Source refresh is shared by every edit; only this boundary knows transport.
    if(session.authenticated&&session.user?.role!=='reader')await load({render:false,force:true,publication:base.dataset.publicationVersion});
    if(generation!==epoch)throw cancelled();content.setBase(base);
    if(root)root.dataset.publicationVersion=base.dataset.publicationVersion??'';
  }
  content.setLoader(()=>{
    if(refreshTask)return refreshTask;
    const current=refresh().finally(()=>{if(refreshTask===current)refreshTask=null;});refreshTask=current;return current;
  });
  return {load,clear,retryResources:()=>retryResources(),get resourcesReady(){return resourcesTask??Promise.resolve();},get accessRevision(){return accessRevision;},get state(){return state;},get ready(){return task??Promise.resolve();}};
}
