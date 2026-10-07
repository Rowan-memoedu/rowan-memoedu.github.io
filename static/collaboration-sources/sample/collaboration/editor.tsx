/* MIT. Plate list/mention/equation components bound to existing outline rows. */
import React,{createContext,useContext,useMemo,useRef,useState} from 'react';
import 'katex/dist/katex.min.css';
import {Plate,PlateElement,PlateLeaf,usePlateEditor,ParagraphPlugin} from 'platejs/react';
import {BoldPlugin,ItalicPlugin,CodePlugin} from '@platejs/basic-nodes/react';
import {ListPlugin,ListItemPlugin,ListItemContentPlugin} from '@platejs/list-classic/react';
import {getListItemEntry,moveListItemsToList} from '@platejs/list-classic';
import {MentionPlugin,MentionInputPlugin} from '@platejs/mention/react';
import {getMentionOnSelectItem} from '@platejs/mention';
import {LinkPlugin} from '@platejs/link/react';
import {InlineEquationPlugin} from '@platejs/math/react';
import {MessageSquareTextIcon,PlusIcon,PencilIcon,SquareIcon} from 'lucide-react';
import {Editor,EditorContainer} from '../upstream/collaboration/plate/registry/ui/editor';
import {ParagraphElement} from '../upstream/collaboration/plate/registry/ui/paragraph-node';
import {MentionElement} from '../upstream/collaboration/plate/registry/ui/mention-node';
import {LinkElement} from '../upstream/collaboration/plate/registry/ui/link-node';
import {InlineEquationElement} from '../upstream/collaboration/plate/registry/ui/equation-node';
import {InlineCombobox,InlineComboboxContent,InlineComboboxEmpty,InlineComboboxGroup,InlineComboboxInput,InlineComboboxItem} from '../upstream/collaboration/plate/registry/ui/inline-combobox';
import {Button} from '../upstream/collaboration/plate/components/ui/button';
import {Popover,PopoverContent,PopoverAnchor} from './popover';
import {toTree,fromTree,toComment,fromComment,fromInline,textOf} from './model.mjs';

const Context=createContext<any>({users:[],readOnly:false});
const selectMention=getMentionOnSelectItem();
const uid=()=>crypto.randomUUID();
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
function List(props:any){return <PlateElement {...props} as="ul"/>;}
function Item(props:any){
  const [folded,setFolded]=useState(false),{preview}=useContext(Context);
  const nested=props.element.children.some((n:any)=>n.type==='ul'||n.type==='ol');
  const focus=()=>{const path=props.editor.api.findPath(props.element);if(path){props.editor.tf.select(props.editor.api.start([...path,0]));props.editor.tf.focus();}};
  return <PlateElement {...props} as="li" id={'discussion-node-'+props.element.id} className="outline-node collaboration-outline-node" attributes={{...props.attributes,'data-collaboration-node':props.element.id,'data-folded':folded}}>
    {!preview&&<span className="outline-controls" data-collaboration-controls="" contentEditable={false}>
      <button className="fold-button" type="button" aria-label={folded?'展开子节点':'折叠子节点'} aria-expanded={!folded} disabled={!nested} onMouseDown={e=>e.preventDefault()} onClick={()=>setFolded(v=>!v)}>{nested?(folded?'▸':'▾'):' '}</button>
      <button className="node-focus" type="button" aria-label="聚焦此节点" onMouseDown={e=>e.preventDefault()} onClick={focus}>●</button>
    </span>}{props.children}
  </PlateElement>;
}
function ContributionLine(props:any){
  const {onComment,onApprove,owner,readOnly,preview,inlineRoot,comments}=useContext(Context);
  const path=props.editor.api.findPath(props.element),itemPath=path?.slice(0,-1),parent=itemPath?props.editor.api.node(itemPath)?.[0]:null;
  const count=comments?.[parent?.id]??0;
  const canApprove=itemPath?.length===2||(inlineRoot&&itemPath?.length===4);
  function child(){
    if(itemPath)appendChild(props.editor,itemPath);
  }
  return <PlateElement {...props} className="node-content" attributes={{...props.attributes,'data-contribution-node':parent?.id}}>
    {props.children}
    {!preview&&<span contentEditable={false} className="collaboration-row-actions" onMouseDown={e=>e.preventDefault()}>
      <button type="button" className="collaboration-action collaboration-transient" role="checkbox" aria-checked="false" aria-label="采纳此节点及子树" disabled={!owner||readOnly||!canApprove} title={!owner?'由站长采纳':!canApprove?'父节点尚未采纳，请采纳其父级子树':'采纳此节点及其子树'} onClick={()=>onApprove?.(parent.id)}><SquareIcon/></button>
      <button type="button" className={'collaboration-action '+(count?'collaboration-comment-existing':'collaboration-transient')} aria-label={count?`查看 ${count} 条子节点批注`:'批注此子节点'} onClick={()=>onComment?.(parent.id)}><MessageSquareTextIcon/>{count>0&&<span>{count}</span>}</button>
      <button type="button" className="collaboration-action collaboration-transient" aria-label="添加嵌套子节点" disabled={readOnly} onClick={child}><PlusIcon/></button>
      <button type="button" className="collaboration-action collaboration-transient" aria-label="编辑此讨论节点" disabled={readOnly} onClick={()=>{props.editor.tf.select(props.editor.api.start(path));props.editor.tf.focus();}}><PencilIcon/></button>
    </span>}
  </PlateElement>;
}
function Strong(props:any){return <PlateLeaf {...props} as="strong"/>;}
function Em(props:any){return <PlateLeaf {...props} as="em"/>;}
function Code(props:any){return <PlateLeaf {...props} as="code"/>;}

export function RichEditor({initial,tree=false,inlineRoot=false,preview=false,readOnly=false,users=[],onChange,onEmpty,onComment,onApprove,owner=false,comments={},editorRef,placeholder='',label='协作编辑器',onSubmit}:any){
  const plugins=useMemo(()=>[
    ParagraphPlugin.withComponent(ParagraphElement),BoldPlugin.withComponent(Strong),ItalicPlugin.withComponent(Em),CodePlugin.withComponent(Code),
    LinkPlugin.configure({options:{allowedSchemes:['https','http','mailto'],dangerouslySkipSanitization:false}}).withComponent(LinkElement),
    InlineEquationPlugin.withComponent(InlineEquationElement),
    MentionPlugin.configure({options:{triggerPreviousCharPattern:/^$|^[\s"']$/}}).extendEditorTransforms(({editor,type}:any)=>({insert:{mention:({key,value}:any)=>editor.tf.insertNodes({type,id:uid(),key,value,children:[{text:''}]})}})).withComponent((props:any)=><MentionElement {...props} prefix="@"/>),
    MentionInputPlugin.withComponent(MentionInput),
    ...(tree?[ListPlugin.configure({options:{enableResetOnShiftTab:false}}).configurePlugin({key:'ul'} as any,{node:{component:List}}).configurePlugin({key:'ol'} as any,{node:{component:List}}),ListItemPlugin.withComponent(Item),ListItemContentPlugin.withComponent(ContributionLine)]:[])
  ],[tree]);
  const editor=usePlateEditor({plugins,value:tree?toTree(initial):toComment(initial)});
  if(editorRef)editorRef.current=editor;
  const composing=useRef(false),linkSelection=useRef<any>(null),[error,setError]=useState(''),[linkOpen,setLinkOpen]=useState(false),[url,setUrl]=useState('');
  const changed=()=>{if(readOnly||composing.current)return;try{onChange?.(tree?fromTree(editor.children):fromComment(editor.children));setError('');}catch(e:any){setError(e.message);}};
  function keydown(e:React.KeyboardEvent){
    if(readOnly||composing.current||e.nativeEvent.isComposing)return;
    if(tree&&!editor.selection)editor.tf.select(editor.api.start([]));
    const handled=()=>{e.preventDefault();e.stopPropagation();};
    if((e.ctrlKey||e.metaKey)&&!e.altKey){
      const key=e.key.toLowerCase(),mark:any={b:'bold',i:'italic',e:'code'};
      if(tree&&key==='a'&&!e.shiftKey){handled();editor.tf.select(editor.api.range([]));return;}
      if(tree&&!e.shiftKey&&(key==='home'||key==='end')){handled();editor.tf.select(key==='home'?editor.api.start([]):editor.api.end([]));return;}
      if(mark[key]&&!e.shiftKey){handled();editor.tf.toggleMark(mark[key]);return;}
      if(key==='k'){handled();linkSelection.current=editor.selection;setUrl('');setLinkOpen(true);return;}
      if(key==='m'&&e.shiftKey){handled();editor.getTransforms(InlineEquationPlugin).insert.inlineEquation('');return;}
      if(key==='enter'&&onSubmit){handled();onSubmit();return;}
    }
    if(!tree)return;
    const nodes=fromTree(editor.children);
    if(e.key==='Backspace'&&editor.api.isCollapsed()&&nodes.length===1&&!nodes[0].children.length&&!textOf(nodes[0].content).trim()){
      handled();onEmpty?.();return;
    }
    const entry=getListItemEntry(editor);if(!entry)return;
    const [item,at]=entry.listItem;
    if(!e.ctrlKey&&!e.metaKey&&(e.key==='Home'||e.key==='End')){
      handled();const point=e.key==='Home'?editor.api.start([...at,0]):editor.api.end([...at,0]);
      editor.tf.select(e.shiftKey?{anchor:editor.selection.anchor,focus:point}:point);return;
    }
    if(inlineRoot&&e.key==='Tab'&&e.shiftKey&&at.length<=4){handled();return;}
    if(inlineRoot&&at.length===2&&e.key==='Enter'&&!e.shiftKey){handled();appendChild(editor,at);return;}
    if(e.key!=='Backspace'||!editor.api.isCollapsed())return;
    const line:any=item.children.find((n:any)=>n.type==='lic');
    if(!line)return;
    if(textOf(fromInline(line.children)).trim()){
      if(at.length===2&&at[1]===0&&editor.api.isStart(editor.selection.anchor,[...at,0]))handled();
      return;
    }
    handled();
    if(inlineRoot&&at.length===2){onEmpty?.(fromTree(editor.children)[0].children);return;}
    const point=editor.api.before(at)??editor.api.after(at),ref=point?editor.api.pointRef(point):null;
    editor.tf.withoutNormalizing(()=>{
      moveListItemsToList(editor,{fromListItem:entry.listItem,toList:entry.list,toListIndex:at.at(-1)!+1});
      editor.tf.removeNodes({at});
    });
    editor.tf.select(ref?.unref()??editor.api.start([]));editor.tf.focus();
  }
  return <Context.Provider value={{users,onComment,onApprove,owner,readOnly,preview,inlineRoot,comments}}><Plate editor={editor} readOnly={readOnly} onValueChange={changed}>
    <Popover open={linkOpen} onOpenChange={setLinkOpen}><PopoverAnchor asChild><EditorContainer className={tree?'collaboration-outline-editor':'collaboration-comment-editor'} variant="default" data-collaboration-tree={tree?'':undefined}>
      <Editor variant="none" aria-label={label} placeholder={placeholder} onFocus={()=>{if(tree&&!editor.selection)editor.tf.select(editor.api.start([]));}} onKeyDownCapture={keydown} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;queueMicrotask(changed);}} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();setError('暂不支持图片或附件');}}}/>
    </EditorContainer></PopoverAnchor><PopoverContent aria-label="插入链接" className="collaboration-link-dialog"><form onSubmit={e=>{e.preventDefault();try{const target=new URL(url);if(!['http:','https:','mailto:'].includes(target.protocol))throw Error('请输入有效链接');if(linkSelection.current)editor.tf.select(linkSelection.current);const text=editor.api.string(editor.selection) || url;editor.tf.insertNodes({type:'a',url,children:[{text}]});setLinkOpen(false);editor.tf.focus();}catch{setError('请输入 http、https 或 mailto 链接');}}}><label>链接地址<input autoFocus required value={url} onChange={e=>setUrl(e.target.value)}/></label><Button type="submit" size="sm">插入</Button></form></PopoverContent></Popover>
    {error&&<p className="collaboration-error" role="status">{error}</p>}
  </Plate></Context.Provider>;
}
