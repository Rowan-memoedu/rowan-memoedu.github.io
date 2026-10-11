// Scope the unchanged upstream Radix/Plate popover when it renders in a portal.
import * as React from 'react';
import {PopoverContent as Original,Popover,PopoverTrigger,PopoverAnchor} from '../upstream/collaboration/plate/components/ui/popover';
export {Popover,PopoverTrigger,PopoverAnchor};
export function PopoverContent({className='',onEscapeKeyDown,...props}:any){return <Original {...props} onEscapeKeyDown={event=>{
  // Escape first cancels the upstream mention picker, retaining the reply
  // composer. Radix otherwise closes the containing discussion as well.
  if(event.target instanceof Element&&event.target.closest('[role="combobox"]'))event.preventDefault();
  else onEscapeKeyDown?.(event);
}} className={'collaboration-ui '+className}/>;}
