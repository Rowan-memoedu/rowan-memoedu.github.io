/* MIT. Plate registry adaptation: only data binding, namespace and wire identity.
 * Original components and license: sample/upstream/collaboration/plate. */
import React,{createContext,useContext,useMemo,useRef,useState} from 'react';
import 'katex/dist/katex.min.css';
import {Plate,PlateElement,PlateLeaf,usePlateEditor,ParagraphPlugin} from 'platejs/react';
import {BoldPlugin,ItalicPlugin,CodePlugin} from '@platejs/basic-nodes/react';
import {ListPlugin,ListItemPlugin,ListItemContentPlugin} from '@platejs/list-classic/react';
import {MentionPlugin,MentionInputPlugin} from '@platejs/mention/react';
import {getMentionOnSelectItem} from '@platejs/mention';
import {LinkPlugin} from '@platejs/link/react';
import {InlineEquationPlugin} from '@platejs/math/react';
import {BoldIcon,ItalicIcon,CodeIcon,LinkIcon,RadicalIcon,MessageSquareTextIcon,SquareIcon} from 'lucide-react';
import {Editor,EditorContainer} from '../upstream/collaboration/plate/registry/ui/editor';
import {BulletedListElement,NumberedListElement,ListItemElement} from '../upstream/collaboration/plate/registry/ui/list-classic-node';
import {ParagraphElement} from '../upstream/collaboration/plate/registry/ui/paragraph-node';
import {MentionElement} from '../upstream/collaboration/plate/registry/ui/mention-node';
import {LinkElement} from '../upstream/collaboration/plate/registry/ui/link-node';
import {InlineEquationElement} from '../upstream/collaboration/plate/registry/ui/equation-node';
import {InlineCombobox,InlineComboboxContent,InlineComboboxEmpty,InlineComboboxGroup,InlineComboboxInput,InlineComboboxItem} from '../upstream/collaboration/plate/registry/ui/inline-combobox';
import {Button} from '../upstream/collaboration/plate/components/ui/button';
import {Popover,PopoverContent,PopoverTrigger} from './popover';
import {toTree,fromTree,toComment,fromComment} from './model.mjs';

const Context=createContext<any>({users:[],onComment:null,readOnly:false});
const selectMention=getMentionOnSelectItem();
function MentionInput(props:any){
  const {users}=useContext(Context),[search,setSearch]=useState('');
  return <PlateElement {...props} as="span"><InlineCombobox value={search} element={props.element} setValue={setSearch} showTrigger={false} trigger="@">
    <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring focus-within:ring-2"><InlineComboboxInput aria-label="搜索可提及的用户"/></span>
    <InlineComboboxContent className="collaboration-ui my-1.5"><InlineComboboxEmpty>没有可提及的用户</InlineComboboxEmpty><InlineComboboxGroup>
      {users.map((u:any)=><InlineComboboxItem key={u.id} value={u.name} onClick={()=>selectMention(props.editor,{key:u.id,text:u.name},search)}>{u.name}</InlineComboboxItem>)}
    </InlineComboboxGroup></InlineComboboxContent></InlineCombobox>{props.children}</PlateElement>;
}
function ContributionLine(props:any){
  const {onComment,onApprove,approvalNode}=useContext(Context);
  const path=props.editor.api.findPath(props.element);
  const parent=path?props.editor.api.node(path.slice(0,-1))?.[0]:null;
  return <PlateElement {...props} className="relative w-full" attributes={{...props.attributes,'data-contribution-node':parent?.id}}>
    {props.children}
    {onApprove&&parent?.id===approvalNode&&<span contentEditable={false} className="collaboration-node-action"><Button variant="ghost" size="icon-xs" role="checkbox" aria-checked="false" aria-label="采纳整棵子树" onMouseDown={e=>e.preventDefault()} onClick={onApprove}><SquareIcon className="size-4"/></Button></span>}
    {onComment&&<span contentEditable={false} className="collaboration-node-action"><Button variant="ghost" size="icon-xs" aria-label="批注此子节点" onMouseDown={e=>e.preventDefault()} onClick={()=>onComment(parent?.id)}><MessageSquareTextIcon className="size-4"/></Button></span>}
  </PlateElement>;
}
function Strong(props:any){return <PlateLeaf {...props} as="strong"/>;}
function Em(props:any){return <PlateLeaf {...props} as="em"/>;}
function Code(props:any){return <PlateLeaf {...props} as="code"/>;}
function Toolbar({editor}:any){
  const [link,setLink]=useState(''),[label,setLabel]=useState(''),[open,setOpen]=useState(false);
  return <div className="flex flex-wrap gap-1" role="toolbar" aria-label="文字格式">
    {[['bold','加粗',BoldIcon],['italic','斜体',ItalicIcon],['code','代码',CodeIcon]].map(([mark,title,Icon]:any)=><Button key={mark} size="icon-xs" variant="ghost" aria-label={title} onMouseDown={e=>e.preventDefault()} onClick={()=>{editor.tf.toggleMark(mark);editor.tf.focus();}}><Icon className="size-4"/></Button>)}
    <Button size="icon-xs" variant="ghost" aria-label="插入公式" onMouseDown={e=>e.preventDefault()} onClick={()=>{editor.getTransforms(InlineEquationPlugin).insert.inlineEquation('');editor.tf.focus();}}><RadicalIcon className="size-4"/></Button>
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button size="icon-xs" variant="ghost" aria-label="插入链接" onMouseDown={e=>e.preventDefault()}><LinkIcon className="size-4"/></Button></PopoverTrigger>
      <PopoverContent><form onSubmit={e=>{e.preventDefault();const url=new URL(link);if(!['http:','https:','mailto:'].includes(url.protocol))return;editor.tf.insertNodes({type:'a',url:link,children:[{text:label||link}]});setOpen(false);editor.tf.focus();}}>
        <label className="block text-sm">链接文字<input className="w-full rounded-md border p-2" value={label} onChange={e=>setLabel(e.target.value)}/></label>
        <label className="block text-sm">地址<input required type="url" className="w-full rounded-md border p-2" value={link} onChange={e=>setLink(e.target.value)}/></label><Button type="submit" size="sm">插入</Button>
      </form></PopoverContent></Popover>
  </div>;
}

export function RichEditor({initial,tree=false,readOnly=false,users=[],onChange,onComment,onApprove,editorRef,placeholder='输入内容，使用 @ 提及对方…',label='协作编辑器'}:any){
  const plugins=useMemo(()=>[
    ParagraphPlugin.withComponent(ParagraphElement),BoldPlugin.withComponent(Strong),ItalicPlugin.withComponent(Em),CodePlugin.withComponent(Code),
    LinkPlugin.configure({options:{allowedSchemes:['https','http','mailto'],dangerouslySkipSanitization:false}}).withComponent(LinkElement),
    InlineEquationPlugin.withComponent(InlineEquationElement),
    MentionPlugin.configure({options:{triggerPreviousCharPattern:/^$|^[\s"']$/}}).extendEditorTransforms(({editor,type}:any)=>({insert:{mention:({key,value}:any)=>editor.tf.insertNodes({type,id:crypto.randomUUID(),key,value,children:[{text:''}]})}})).withComponent((props:any)=><MentionElement {...props} prefix="@"/>),
    MentionInputPlugin.withComponent(MentionInput),
    ...(tree?[ListPlugin.configure({options:{enableResetOnShiftTab:false}}).configurePlugin({key:'ul'} as any,{node:{component:BulletedListElement}}).configurePlugin({key:'ol'} as any,{node:{component:NumberedListElement}}),ListItemPlugin.withComponent(ListItemElement),ListItemContentPlugin.withComponent(ContributionLine)]:[])
  ],[tree]);
  const editor=usePlateEditor({plugins,value:tree?toTree(initial):toComment(initial)});
  if(editorRef)editorRef.current=editor;
  const composing=useRef(false),[error,setError]=useState('');
  const changed=()=>{if(readOnly||composing.current)return;try{const value=tree?fromTree(editor.children):fromComment(editor.children);onChange?.(value);setError('');}catch(e:any){setError(e.message);}};
  return <Context.Provider value={{users,onComment,onApprove,approvalNode:tree?initial[0]?.id:null,readOnly}}><Plate editor={editor} readOnly={readOnly} onValueChange={changed}>
    {!readOnly&&<Toolbar editor={editor}/>}
    <EditorContainer variant={tree?'select':'comment'}><Editor variant={tree?'select':'comment'} aria-label={label} placeholder={placeholder} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;queueMicrotask(changed);}} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();setError('暂不支持图片或附件');}}}/></EditorContainer>
    {error&&<p className="text-sm text-destructive" role="status">{error}</p>}
  </Plate></Context.Provider>;
}
