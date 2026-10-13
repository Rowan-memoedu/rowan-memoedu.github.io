/* MIT. Plate list/mention/equation components bound to existing outline rows. */
import React,{createContext,useContext,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import 'katex/dist/katex.min.css';
import {Plate,PlateElement,PlateLeaf,usePlateEditor,ParagraphPlugin} from 'platejs/react';
import {BoldPlugin,ItalicPlugin,CodePlugin} from '@platejs/basic-nodes/react';
import {ListPlugin,ListItemPlugin,ListItemContentPlugin} from '@platejs/list-classic/react';
import {getListItemEntry,moveListItemsToList,indentListItems,unindentListItems} from '@platejs/list-classic';
import {DndContext,DragOverlay,PointerSensor,KeyboardSensor,useSensor,useSensors,useDraggable,useDroppable,closestCenter,pointerWithin} from '@dnd-kit/core';
import {MentionPlugin,MentionInputPlugin} from '@platejs/mention/react';
import {getMentionOnSelectItem} from '@platejs/mention';
import {LinkPlugin} from '@platejs/link/react';
import {InlineEquationPlugin} from '@platejs/math/react';
import {MessageSquareTextIcon,SquareIcon,GripVerticalIcon,SettingsIcon} from 'lucide-react';
import {Editor,EditorContainer} from '../upstream/collaboration/plate/registry/ui/editor';
import {ParagraphElement} from '../upstream/collaboration/plate/registry/ui/paragraph-node';
import {MentionElement} from '../upstream/collaboration/plate/registry/ui/mention-node';
import {LinkElement} from '../upstream/collaboration/plate/registry/ui/link-node';
import {InlineEquationElement} from '../upstream/collaboration/plate/registry/ui/equation-node';
import {InlineCombobox,InlineComboboxContent,InlineComboboxEmpty,InlineComboboxGroup,InlineComboboxInput,InlineComboboxItem} from '../upstream/collaboration/plate/registry/ui/inline-combobox';
import {Button} from '../upstream/collaboration/plate/components/ui/button';
import {Checkbox} from '../upstream/collaboration/plate/components/ui/checkbox';
import {nextTodoState,checkedTodoState} from './todo.mjs';
import {Popover,PopoverContent,PopoverAnchor} from './popover';
import {toTree,fromTree,toComment,fromComment,fromInline,textOf} from './model.mjs';
import {outlineView,routeNodeId,canAdoptOutlineNode,plateOutlineNodes,documentViewSplit} from './outline-view.mjs';

const Context=createContext<any>({users:[],readOnly:false});
const selectMention=getMentionOnSelectItem();
const uid=()=>crypto.randomUUID();
const collisions=(args:any)=>{
  const from=args.active.data.current?.path;
  const droppableContainers=args.droppableContainers.filter((drop:any)=>{
    const to=drop.data.current?.path;
    return !from||!to||!from.every((v:number,i:number)=>to[i]===v);
  });
  const targets={...args,droppableContainers},hits=pointerWithin(targets);
  return hits.length?hits:closestCenter(targets);
};
// Open the same Plate mention input used by typing @, retaining the caret.
export function openMentionPicker(editor:any){
  if(!editor)return;
  if(!editor.selection)editor.tf.select(editor.api.end([]));
  editor.tf.insertNodes({type:editor.getType(MentionInputPlugin.key),trigger:'@',children:[{text:''}]});
  // The upstream input takes focus when it mounts. Focusing the old editor
  // here would restore its previous DOM selection and dismiss the new input.
}
function appendChild(editor:any,itemPath:number[]){
  const parent=editor.api.node(itemPath)?.[0];if(!parent)return;
  const index=parent.children.findIndex((n:any)=>n.type==='ul'||n.type==='ol');
  const li={type:'li',id:uid(),children:[{type:'lic',id:uid(),children:[{text:''}]}]};let at:number[];
  if(index<0){at=[...itemPath,parent.children.length];editor.tf.insertNodes({type:'ul',id:uid(),children:[li]},{at});at=[...at,0,0];}
  else{at=[...itemPath,index,parent.children[index].children.length];editor.tf.insertNodes(li,{at});at=[...at,0];}
  editor.tf.select(editor.api.start(at));editor.tf.focus();
}
function MentionInput(props:any){
  const {users}=useContext(Context),[search,setSearch]=useState('');
  return <PlateElement {...props} as="span"><InlineCombobox value={search} element={props.element} setValue={setSearch} showTrigger={false} trigger="@">
    <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring focus-within:ring-2"><InlineComboboxInput aria-label="搜索可提及的用户"/></span>
    <InlineComboboxContent className="collaboration-ui my-1.5"><InlineComboboxEmpty>没有可提及的用户</InlineComboboxEmpty><InlineComboboxGroup>
      {users.map((u:any)=><InlineComboboxItem key={u.id} value={u.name} onClick={()=>selectMention(props.editor,{key:u.id,text:u.name},search)}>{u.name}</InlineComboboxItem>)}
    </InlineComboboxGroup></InlineComboboxContent></InlineCombobox>{props.children}</PlateElement>;
}
function CalloutLabel({name,as:Tag='div'}:any){return <Tag contentEditable={false} className="callout-label"><span className="callout-icon" aria-hidden="true"/><strong>{name??'Call Out'}</strong></Tag>;}
function List(props:any){
  const context=useContext(Context),{view,nativeMetadata,annotationContext}=context,path=props.editor.api.findPath(props.element);
  const parent=path?.length>1?props.editor.api.node(path.slice(0,-1))?.[0]:null;
  const metadata=nativeMetadata?.[parent?.id],callout=metadata?.sourceCallout&&view?.get(parent?.id)?.current;
  const split=!annotationContext&&!view?.get(parent?.id)?.ancestor&&['document','dailyDocument'].includes(metadata?.remType)?documentViewSplit(props.element.children,nativeMetadata):-1;
  const children=React.Children.toArray(props.children);
  return <PlateElement {...props} as="ul" className={callout?'inline-document-callout callout':undefined} attributes={{...props.attributes,'data-callout':callout?metadata.calloutType??'inline':undefined}}>{callout&&<CalloutLabel as="li" name={metadata.calloutLabel}/>}{split>=0?<li className="collaboration-document-body">{split>0&&<aside className="document-annotations callout" data-callout="note"><div contentEditable={false} className="callout-label" dangerouslySetInnerHTML={{__html:metadata.annotationHeader??'<strong></strong>'}}/><div className="callout-content"><ul className="annotation-nodes"><Context.Provider value={{...context,annotationContext:true}}>{children.slice(0,split)}</Context.Provider></ul></div></aside>}{split>0&&<hr className="document-separator" aria-hidden="true"/>}<ul className="document-children">{children.slice(split)}</ul></li>:props.children}</PlateElement>;
}
function Item(props:any){
  const {preview,inlineRoot,titleClasses,mutable,outline,readOnly,view,nativeMetadata,annotationContext}=useContext(Context);
  const [folded,setFolded]=useState(()=>!!nativeMetadata?.[props.element.id]?.folded);
  const editable=mutable?.(props.element.id)??true;
  const path=props.editor.api.findPath(props.element);
  const fixedRoot=inlineRoot&&path?.length===2;
  const draggable=editable&&!readOnly&&!preview&&!fixedRoot;
  const drag=useDraggable({id:props.element.id,data:{path},disabled:!draggable});
  const scope=view?.get(props.element.id);
  const title=scope?.current||inlineRoot&&!outline&&titleClasses.includes('document-title')&&path?.length===2;
  const metadata=nativeMetadata?.[props.element.id],callout=metadata?.sourceCallout&&!title&&!scope?.ancestor&&props.element.id!==outline?.scopeRootId;
  const documentType=['document','dailyDocument'].includes(metadata?.remType);
  const nested=props.element.children.some((n:any)=>n.type==='ul'||n.type==='ol');
  const focus=()=>{window.location.hash='node-'+props.element.id;};
  return <PlateElement {...props} ref={drag.setNodeRef} as="li" id={'discussion-node-'+props.element.id} style={{...props.style,'--collaboration-source-bullet':metadata?.bulletColor} as any} className={'outline-node collaboration-outline-node'+(documentType&&!annotationContext?' outline-document':'')+(title?' document-current is-focused':'')+(scope?.ancestor?' focus-ancestor':'')+(callout?' inline-document-callout callout':'')} attributes={{...props.attributes,hidden:scope?.hidden,'data-rem-type':metadata?.remType,'data-document-role':annotationContext?'annotation':documentType?'document':undefined,'data-reader-node':!!scope&&!scope.hidden&&!scope.ancestor,'data-callout':callout?metadata.calloutType??'inline':undefined,'data-collaboration-node':props.element.id,'data-folded':folded&&!scope?.ancestor&&!title,'data-editable':editable&&!readOnly&&!preview,'data-draggable':draggable,'data-dragging':drag.isDragging}}>
    {callout&&<CalloutLabel name={metadata.calloutLabel}/>}
    {(!preview||props.element.todoState)&&<span className="outline-controls" data-collaboration-controls="" contentEditable={false}>
      {props.element.todoState&&draggable&&<button type="button" ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners} className="collaboration-todo-drag" aria-label="拖动待办节点" onMouseDown={e=>e.preventDefault()}><GripVerticalIcon size={12}/></button>}
      <button className="fold-button" type="button" aria-label={folded?'展开子节点':'折叠子节点'} aria-expanded={!folded} disabled={!nested} onMouseDown={e=>e.preventDefault()} onClick={()=>setFolded(v=>!v)}>{nested?(folded?'▸':'▾'):' '}</button>
      {props.element.todoState?<Checkbox className="node-todo" aria-label={props.element.todoState==='Finished'?'取消完成待办':'完成待办'} checked={props.element.todoState==='Finished'} disabled={!editable||readOnly} onMouseDown={e=>e.preventDefault()} onCheckedChange={checked=>props.editor.tf.setNodes({todoState:checkedTodoState(checked)},{at:path})}/>:<button ref={drag.setActivatorNodeRef} {...(draggable?drag.attributes:{})} {...drag.listeners} className={'node-focus'+(documentType?' document-focus':metadata?.listNumber?' numbered-focus':'')} type="button" aria-label={draggable?'拖动节点或聚焦此节点':'聚焦此节点'} onMouseDown={e=>e.preventDefault()} onClick={focus}>{documentType?metadata.focusLabel??'📄':metadata?.listNumber?metadata.focusLabel:'●'}</button>}
    </span>}{props.children}
  </PlateElement>;
}
function ContributionLine(props:any){
  const {onComment,onApprove,onPermissions,owner,readOnly,preview,inlineRoot,titleClasses,comments,mutable,outline,nativeMarkup,nativeMetadata,view}=useContext(Context);
  const path=props.editor.api.findPath(props.element),itemPath=path?.slice(0,-1),parent=itemPath?props.editor.api.node(itemPath)?.[0]:null;
  const count=comments?.[parent?.id]??0;
  const editable=mutable?.(parent?.id)??true;
  const drop=useDroppable({id:parent?.id??props.element.id,data:{path:itemPath},disabled:preview||readOnly||inlineRoot&&itemPath?.length===2});
  const parentId=itemPath?.length>2?props.editor.api.node(itemPath.slice(0,-2))?.[0]?.id:null;
  const canApprove=outline?editable&&canAdoptOutlineNode(outline,parent?.id,parentId):itemPath?.length===2||(inlineRoot&&itemPath?.length===4);
  const current=view?.get(parent?.id)?.current||inlineRoot&&!outline&&titleClasses.includes('document-title')&&itemPath?.length===2;
  return <PlateElement {...props} ref={drop.setNodeRef} contentEditable={editable?undefined:false} className={'node-content'+(current?' document-title':'')} attributes={{...props.attributes,'data-contribution-node':parent?.id,'data-drop-target':drop.isOver,role:current?'heading':undefined,'aria-level':current?1:undefined}}>
    {!editable&&nativeMarkup?.[parent?.id]?<><span contentEditable={false} dangerouslySetInnerHTML={{__html:nativeMarkup[parent.id]}}/><span hidden>{props.children}</span></>:props.children}
    {!preview&&<span contentEditable={false} className="collaboration-row-actions" onMouseDown={e=>e.preventDefault()}>
      {owner&&editable&&<button type="button" className="collaboration-action collaboration-transient" role="checkbox" aria-checked="false" aria-label="采纳此节点及子树" disabled={readOnly||!canApprove} title={!canApprove?'父节点尚未采纳，请采纳其父级子树':'采纳此节点及其子树'} onClick={()=>onApprove?.(parent.id)}><SquareIcon/></button>}
      <button type="button" className={'collaboration-action '+(count?'collaboration-comment-existing':'collaboration-transient')} aria-label={count?`查看 ${count} 条子节点批注`:'批注此子节点'} onClick={()=>onComment?.(parent.id)}><MessageSquareTextIcon/>{count>0&&<span>{count}</span>}</button>
      {onPermissions&&nativeMetadata[parent?.id]?.documentAccess==='internal'&&['document','dailyDocument'].includes(nativeMetadata[parent.id].remType)&&<button type="button" className="collaboration-action collaboration-transient" aria-label="权限设置" title="权限设置" onClick={()=>onPermissions(parent.id)}><SettingsIcon/></button>}
    </span>}
  </PlateElement>;
}
function Strong(props:any){return <PlateLeaf {...props} as="strong"/>;}
function Em(props:any){return <PlateLeaf {...props} as="em"/>;}
function Code(props:any){return <PlateLeaf {...props} as="code"/>;}

export function RichEditor({initial,tree=false,inlineRoot=false,outline=null,nativeMarkup={},nativeMetadata={},titleClasses='',preview=false,readOnly=false,users=[],onChange,onEmpty,onComment,onApprove,onPermissions,owner=false,comments={},editorRef,placeholder='',label='协作编辑器',onSubmit}:any){
  const mutable=(id:string)=>!outline||!outline.originalIds.includes(id)||outline.editableIds.includes(id);
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor));
  const plugins=useMemo(()=>[
    ParagraphPlugin.withComponent(ParagraphElement),BoldPlugin.withComponent(Strong),ItalicPlugin.withComponent(Em),CodePlugin.withComponent(Code),
    LinkPlugin.configure({options:{allowedSchemes:['https','http','mailto'],dangerouslySkipSanitization:false}}).withComponent(LinkElement),
    InlineEquationPlugin.withComponent(InlineEquationElement),
    MentionPlugin.configure({options:{triggerPreviousCharPattern:/^$|^[\s"']$/}}).extendEditorTransforms(({editor,type}:any)=>({insert:{mention:({key,value}:any)=>editor.tf.insertNodes({type,id:uid(),key,value,children:[{text:''}]})}})).withComponent((props:any)=><MentionElement {...props} prefix="@"/>),
    MentionInputPlugin.withComponent(MentionInput),
    ...(tree?[ListPlugin.configure({options:{enableResetOnShiftTab:false}}).configurePlugin({key:'ul'} as any,{node:{component:List}}).configurePlugin({key:'ol'} as any,{node:{component:List}}),ListItemPlugin.withComponent(Item),ListItemContentPlugin.withComponent(ContributionLine)]:[])
  ],[tree]);
  const editor=usePlateEditor({plugins,value:tree?toTree(initial):toComment(initial)});
  const [route,setRoute]=useState(()=>routeNodeId(window.location.hash)),[viewRevision,setViewRevision]=useState(0);
  const view=tree&&!preview?outlineView(plateOutlineNodes(editor.children),route,{metadata:nativeMetadata,scopeId:outline?.scopeRootId,editableIds:outline?.editableIds,originalIds:outline?.originalIds}):null;
  useLayoutEffect(()=>{
    if(!tree||preview)return;
    const sync=()=>setRoute(routeNodeId(window.location.hash));
    window.addEventListener('personal-outline-focus-changed',sync);window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);
    // Slate is already committed before the reader resolves this route.
    document.querySelector<any>('.reading-outline')?.personalOutlineRefresh?.();
    return()=>{window.removeEventListener('personal-outline-focus-changed',sync);window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};
  },[tree,preview,editor]);
  useLayoutEffect(()=>{if(tree&&!preview)document.querySelector<any>('.reading-outline')?.personalOutlineRefresh?.();},[route,viewRevision]);
  if(editorRef)editorRef.current=editor;
  const composing=useRef(false),linkSelection=useRef<any>(null),[error,setError]=useState(''),[linkOpen,setLinkOpen]=useState(false),[url,setUrl]=useState('');
  const [dragView,setDragView]=useState<any>(null);
  const changed=()=>{if(readOnly||composing.current)return;try{onChange?.(tree?fromTree(editor.children):fromComment(editor.children));if(tree)setViewRevision(v=>v+1);setError('');}catch(e:any){setError(e.message);}};
  function selectVisibleEdge(end=false){
    const entries=[...editor.api.nodes({at:[],match:(n:any)=>n.type==='li'&&mutable(n.id)&&(!view||!view.get(n.id)?.hidden&&!view.get(n.id)?.ancestor)})];
    const entry=end?entries.at(-1):entries[0];if(entry)editor.tf.select(end?editor.api.end([...entry[1],0]):editor.api.start([...entry[1],0]));
  }
  function moveItem(id:string,from:number[],to:number[],refocus=false){
    const selection=editor.selection;
    const inside=(point:any)=>point&&from.every((v,i)=>point.path[i]===v);
    const relative=selection&&inside(selection.anchor)&&inside(selection.focus)?{
      anchor:{...selection.anchor,path:selection.anchor.path.slice(from.length)},
      focus:{...selection.focus,path:selection.focus.path.slice(from.length)}
    }:null;
    // Empty-list normalization and forward moves can shift the destination.
    // Rebind the selection to the preserved node ID after Slate has moved it.
    editor.tf.deselect();editor.tf.moveNodes({at:from,to});
    const moved=[...editor.api.nodes({at:[],match:(n:any)=>n.type==='li'&&n.id===id})][0];
    const destination=moved&&(relative?{
      anchor:{...relative.anchor,path:[...moved[1],...relative.anchor.path]},
      focus:{...relative.focus,path:[...moved[1],...relative.focus.path]}
    }:editor.api.start([...moved[1],0]));
    if(destination){if(refocus)editor.tf.focus({at:destination});else editor.tf.select(destination);}
  }
  function dragEnd(event:any){
    setDragView(null);
    if(readOnly||preview||!event.over||event.active.id===event.over.id||!mutable(event.active.id))return;
    const entries=[...editor.api.nodes({at:[],match:(n:any)=>n.type==='li'})];
    const source=entries.find(([n]:any)=>n.id===event.active.id),target=entries.find(([n]:any)=>n.id===event.over.id);
    if(!source||!target||inlineRoot&&(source[1].length===2||target[1].length===2))return;
    const from=source[1] as number[],to=[...target[1]] as number[];
    if(from.every((v,i)=>to[i]===v))return;
    const pointer=event.activatorEvent;
    const translated=event.active.rect.current.translated;
    const y=typeof pointer?.clientY==='number'?pointer.clientY+event.delta.y:translated?translated.top+translated.height/2:event.over.rect.top;
    const after=y>event.over.rect.top+event.over.rect.height/2;
    if(after)to[to.length-1]++;
    moveItem(event.active.id,from,to,true);
  }
  function dragStart(event:any){
    const entry=[...editor.api.nodes({at:[],match:(n:any)=>n.type==='li'})].find(([n]:any)=>n.id===event.active.id);
    if(!entry)return;
    const node=editor.api.toDOMNode(entry[0]) as HTMLElement,clone=node.cloneNode(true) as HTMLElement;
    // A presentational copy of the existing row/subtree: no second editor,
    // live controls or duplicate Slate identities inside the public overlay.
    for(const el of [clone,...clone.querySelectorAll('*')]){
      for(const attr of [...el.attributes])if(attr.name==='id'||attr.name==='contenteditable'||attr.name.startsWith('data-slate-')||attr.name==='data-collaboration-node'||attr.name==='data-contribution-node')el.removeAttribute(attr.name);
      if(el instanceof HTMLElement)el.tabIndex=-1;
    }
    clone.querySelectorAll('.collaboration-row-actions').forEach(el=>el.remove());
    clone.dataset.dragging='false';
    const style=getComputedStyle(node);
    setDragView({html:clone.outerHTML,width:node.getBoundingClientRect().width,font:style.font,lineHeight:style.lineHeight});
  }
  function keydown(e:React.KeyboardEvent){
    if(readOnly||composing.current||e.nativeEvent.isComposing)return;
    const target=e.target as HTMLElement;
    if(target!==e.currentTarget&&(!e.currentTarget.contains(target)||target.closest('input,textarea,[contenteditable="false"]')))return;
    // Capture shortcuts run before Slate's throttled selectionchange handler.
    // A text click can already point at a different row in the DOM while the
    // model still points at the previous one. Resolve only that identity change;
    // after a move the same row keeps its newly rebound model path.
    if(tree){
      const selection=window.getSelection(),anchor=selection?.anchorNode;
      const row=(anchor?.nodeType===Node.ELEMENT_NODE?anchor as Element:anchor?.parentElement)?.closest('[data-contribution-node]');
      const selected=getListItemEntry(editor)?.listItem?.[0]?.id;
      if(row&&e.currentTarget.contains(row)&&row.getAttribute('data-contribution-node')!==selected){
        const range=editor.api.toSlateRange(selection,{exactMatch:false,suppressThrow:true});if(range)editor.tf.select(range);
      }
    }
    if(tree&&!editor.selection)selectVisibleEdge();
    const handled=()=>{e.preventDefault();e.stopPropagation();};
    if((e.ctrlKey||e.metaKey)&&!e.altKey){
      const key=e.key.toLowerCase(),mark:any={b:'bold',i:'italic',e:'code'};
      if(tree&&key==='a'&&!e.shiftKey){handled();const entry=getListItemEntry(editor);editor.tf.select(outline&&entry?editor.api.range([...entry.listItem[1],0]):editor.api.range([]));return;}
      if(tree&&!e.shiftKey&&(key==='home'||key==='end')){handled();selectVisibleEdge(key==='end');return;}
      if(mark[key]&&!e.shiftKey){handled();editor.tf.toggleMark(mark[key]);return;}
      if(key==='k'){handled();linkSelection.current=editor.selection;setUrl('');setLinkOpen(true);return;}
      if(key==='m'&&e.shiftKey){handled();editor.getTransforms(InlineEquationPlugin).insert.inlineEquation('');return;}
      if(tree&&key==='enter'&&!e.shiftKey){handled();if(e.repeat)return;const entry=getListItemEntry(editor);if(entry&&(!outline||mutable(entry.listItem[0].id)))editor.tf.setNodes({todoState:nextTodoState(entry.listItem[0].todoState)},{at:entry.listItem[1]});return;}
      if(key==='enter'&&onSubmit){handled();onSubmit();return;}
    }
    if(!tree)return;
    const nodes=fromTree(editor.children);
    if(e.key==='Backspace'&&editor.api.isCollapsed()&&nodes.length===1&&!nodes[0].children.length&&!textOf(nodes[0].content).trim()){
      handled();onEmpty?.();return;
    }
    const entry=getListItemEntry(editor);if(!entry)return;
    const [item,at]=entry.listItem;
    if(outline&&!mutable(item.id)){if(e.key==='Tab'||e.key==='Enter'||e.key==='Backspace'||e.key==='Delete')handled();return;}
    if(!e.ctrlKey&&!e.metaKey&&(e.key==='Home'||e.key==='End')){
      handled();const point=e.key==='Home'?editor.api.start([...at,0]):editor.api.end([...at,0]);
      editor.tf.select(e.shiftKey?{anchor:editor.selection.anchor,focus:point}:point);return;
    }
    if(e.key==='Tab'){
      handled();
      if(inlineRoot&&e.shiftKey&&at.length<=4)return;
      if(outline&&at.length===2)return;
      if(e.shiftKey&&at.length>2){
        // List Classic's HTML-list outdent absorbs following siblings. A
        // RemNote outline lifts only this item/subtree, using public Slate.
        const parent=at.slice(0,-2),to=[...parent];to[to.length-1]++;
        moveItem(item.id,at,to);
      }else if(e.shiftKey)unindentListItems(editor,{enableResetOnShiftTab:false});else indentListItems(editor);
      return;
    }
    if(inlineRoot&&(at.length===2||outline&&item.id===outline.scopeRootId)&&e.key==='Enter'&&!e.shiftKey){handled();appendChild(editor,at);return;}
    if(e.key!=='Backspace'||!editor.api.isCollapsed())return;
    const line:any=item.children.find((n:any)=>n.type==='lic');
    if(!line)return;
    if(textOf(fromInline(line.children)).trim()){
      if(outline&&outline.originalIds.includes(item.id)&&editor.api.isStart(editor.selection.anchor,[...at,0]))handled();
      if(at.length===2&&at[1]===0&&editor.api.isStart(editor.selection.anchor,[...at,0]))handled();
      return;
    }
    handled();
    if(outline&&outline.originalIds.includes(item.id))return;
    if(inlineRoot&&at.length===2){onEmpty?.(fromTree(editor.children)[0].children);return;}
    const point=editor.api.before(at)??editor.api.after(at),ref=point?editor.api.pointRef(point):null;
    editor.tf.withoutNormalizing(()=>{
      moveListItemsToList(editor,{fromListItem:entry.listItem,toList:entry.list,toListIndex:at.at(-1)!+1});
      editor.tf.removeNodes({at});
    });
    editor.tf.select(ref?.unref()??editor.api.start([]));editor.tf.focus();
  }
  return <Context.Provider value={{users,onComment,onApprove,onPermissions,owner,readOnly,preview,inlineRoot,titleClasses,comments,outline,mutable,nativeMarkup,nativeMetadata,view}}><DndContext sensors={sensors} collisionDetection={collisions} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={()=>setDragView(null)}><Plate editor={editor} readOnly={readOnly} onValueChange={changed}>
    <Popover open={linkOpen} onOpenChange={setLinkOpen}><PopoverAnchor asChild><EditorContainer className={tree?'collaboration-outline-editor':'collaboration-comment-editor'} variant="default" data-collaboration-tree={tree?'':undefined}>
      <Editor variant="none" aria-label={label} placeholder={placeholder} onFocus={()=>{if(tree&&!editor.selection)selectVisibleEdge();}} onKeyDownCapture={keydown} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;queueMicrotask(changed);}} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();setError('暂不支持图片或附件');}}}/>
    </EditorContainer></PopoverAnchor><PopoverContent aria-label="插入链接" className="collaboration-link-dialog"><form onSubmit={e=>{e.preventDefault();try{const target=new URL(url);if(!['http:','https:','mailto:'].includes(target.protocol))throw Error('请输入有效链接');if(linkSelection.current)editor.tf.select(linkSelection.current);const text=editor.api.string(editor.selection) || url;editor.tf.insertNodes({type:'a',url,children:[{text}]});setLinkOpen(false);editor.tf.focus();}catch{setError('请输入 http、https 或 mailto 链接');}}}><label>链接地址<input autoFocus required value={url} onChange={e=>setUrl(e.target.value)}/></label><Button type="submit" size="sm">插入</Button></form></PopoverContent></Popover>
    {error&&<p className="collaboration-error" role="status">{error}</p>}
  </Plate>{createPortal(<DragOverlay dropAnimation={null}>{dragView&&<div className="collaboration-ui reading-outline collaboration-drag-overlay" data-collaboration-drag-overlay="" aria-hidden="true" style={{width:dragView.width,font:dragView.font,lineHeight:dragView.lineHeight}}><ul dangerouslySetInnerHTML={{__html:dragView.html}}/></div>}</DragOverlay>,document.body)}</DndContext></Context.Provider>;
}
