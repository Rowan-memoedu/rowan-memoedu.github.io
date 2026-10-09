import DOMPurify from 'dompurify';
import {parseProtectedDocument} from './protected-document.mjs';
import {parseReaderMarkup} from './reader-markup.mjs';

/** Access/transport boundary. It delivers nodes; it never renders a view. */
export function createReaderDelivery({window:win,session,content,fetcher=fetch}){
  const doc=win.document,purifier=DOMPurify(win),root=doc.querySelector('.reading-outline');
  let epoch=0,controller=null,task=null,urls=new Set(),state='idle';const assetCache=new Map();
  const cancelled=()=>Object.assign(Error('内容读取已取消'),{name:'AbortError'});
  const revoke=values=>{for(const url of values)win.URL.revokeObjectURL(url);};
  function clear(){
    epoch++;controller?.abort();controller=null;task=null;state='idle';
    content.setLayer('authorized',[]);revoke(urls);urls=new Set();assetCache.clear();
  }
  function load({render=true,force=false}={}){
    if(!root||!session.authenticated||session.user?.role==='reader')return Promise.resolve(false);
    if(task)return task;if(state==='ready'&&!force)return Promise.resolve(true);
    const generation=epoch;controller=new AbortController();const signal=controller.signal;state='loading';
    const valid=()=>generation===epoch&&!signal.aborted&&session.authenticated;
    task=(async()=>{
      const created=new Set();
      try{
        const payload=await(await session.request('/reader',{signal})).json();
        if(!valid())throw cancelled();
        if(payload.schema!=='website-reader-snapshot-v1'||!/^[a-f0-9]{64}$/u.test(payload.version)||!Array.isArray(payload.documents))throw Error('内容快照无效');
        if(root?.dataset.publicationVersion&&payload.publication!==root.dataset.publicationVersion)throw Error('网站内容正在更新，请刷新页面后重试');
        const nodes=[],assets=new Map(),ids=new Set();
        for(const item of payload.documents){
          const node=parseProtectedDocument({document:doc,purifier,payload:item,id:item.id});
          for(const entry of [node,...node.querySelectorAll('.outline-node[id]')]){
            if(ids.has(entry.id))throw Error('内容快照存在重复节点');ids.add(entry.id);
          }
          for(const element of node.querySelectorAll('[data-private-asset]')){
            const asset=element.dataset.privateAsset;
            if(!/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/u.test(asset))throw Error('文件响应无效');
            if(!assets.has(asset))assets.set(asset,{owner:item.id,elements:[]});assets.get(asset).elements.push(element);
          }
          nodes.push(node);
        }
        // Resolve resource ownership once, before any consumer can see this snapshot.
        for(const [asset,{owner,elements}] of assets){
          const key=payload.version+':'+asset;let url=assetCache.get(key);
          if(!url){
            const blob=await(await session.request('/documents/'+owner+'/assets/'+asset+'?version='+payload.version,{signal})).blob();
            if(!valid())throw cancelled();url=win.URL.createObjectURL(blob);created.add(url);
          }
          for(const element of elements)element.setAttribute(element.tagName==='IMG'?'src':'href',url);
        }
        if(!valid())throw cancelled();
        for(const url of created)urls.add(url);
        for(const [asset,{elements}] of assets)assetCache.set(payload.version+':'+asset,elements[0].getAttribute(elements[0].tagName==='IMG'?'src':'href'));
        content.setLayer('authorized',nodes,{render,graph:payload.graph});state='ready';
        return true;
      }catch(error){revoke(created);if(valid())state='error';throw error;}
      finally{if(generation===epoch){task=null;controller=null;}}
    })();return task;
  }
  content.setLoader(async()=>{
    const generation=epoch;
    const html=await(await fetcher('/blog/',{cache:'no-store',credentials:'omit'})).text();
    if(generation!==epoch)throw cancelled();
    const fragment=parseReaderMarkup({document:doc,purifier,html}),base=fragment.querySelector('.reading-outline');
    if(!base)throw Error('页面内容暂不可用');
    // Source refresh is shared by every edit; only this boundary knows transport.
    if(session.authenticated&&session.user?.role!=='reader')await load({render:false,force:true});
    if(generation!==epoch)throw cancelled();content.setBase(base);
  });
  return {load,clear,get state(){return state;},get ready(){return task??Promise.resolve();}};
}
