import React,{useEffect,useId,useState} from 'react';
import {BaseEdge,getSmoothStepPath,Position} from '@xyflow/react';

/** XYFlow supplies edge routing/rendering; this binds existing cards and bars. */
export function DependencyLayer({container,dependencies,tasks,revision}){
  const marker=useId().replaceAll(':',''),[edges,setEdges]=useState([]);
  useEffect(()=>{
    const root=container.current;if(!root)return;
    let frame;
    const measure=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        const rect=root.getBoundingClientRect(),positions=new Map([...root.querySelectorAll('[data-dependency-node]')].map((el:HTMLElement)=>[el.dataset.dependencyNode,el.getBoundingClientRect()]));
        const next=dependencies.flatMap(edge=>{
          const before=positions.get(edge.predecessor_id),after=positions.get(edge.successor_id);if(!before||!after)return [];
          const [path]=getSmoothStepPath({sourceX:before.right-rect.left,sourceY:before.top+before.height/2-rect.top,targetX:after.left-rect.left,targetY:after.top+after.height/2-rect.top,sourcePosition:Position.Right,targetPosition:Position.Left,borderRadius:6,offset:14});
          return [{id:edge.predecessor_id+'-'+edge.successor_id,path,label:`${tasks.find(t=>t.id===edge.predecessor_id)?.title??'前置事项'} → ${tasks.find(t=>t.id===edge.successor_id)?.title??'后续事项'}`}];
        });
        setEdges(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
      });
    };
    const resize=new ResizeObserver(measure);resize.observe(root);
    root.querySelectorAll('[data-dependency-node]').forEach(node=>resize.observe(node));
    root.addEventListener('scroll',measure,true);window.addEventListener('resize',measure);measure();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();root.removeEventListener('scroll',measure,true);window.removeEventListener('resize',measure);};
  },[dependencies,tasks,revision]);
  return <svg className="workspace-dependency-lines" aria-label="事项依赖方向" role="img"><defs><marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="currentColor"/></marker></defs>{edges.map(edge=><g key={edge.id}><title>{edge.label}</title><BaseEdge id={edge.id} path={edge.path} markerEnd={`url(#${marker})`} style={{stroke:'currentColor',strokeWidth:1.8,fill:'none'}} interactionWidth={0}/></g>)}</svg>;
}
