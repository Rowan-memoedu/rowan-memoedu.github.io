// Scope the unchanged upstream Radix/Plate popover when it renders in a portal.
import * as React from 'react';
import {PopoverContent as Original,Popover,PopoverTrigger,PopoverAnchor} from '../upstream/collaboration/plate/components/ui/popover';
export {Popover,PopoverTrigger,PopoverAnchor};
export function PopoverContent({className='',...props}:any){return <Original {...props} className={'collaboration-ui '+className}/>;}
