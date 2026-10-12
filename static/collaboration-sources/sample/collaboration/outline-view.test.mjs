import test from 'node:test';
import assert from 'node:assert/strict';
import {outlineView,routeNodeId,canAdoptOutlineNode,plateOutlineNodes,documentViewSplit} from './outline-view.mjs';
const nodes=[{id:'document',children:[{id:'other',children:[]},{id:'parent',children:[{id:'target',children:[{id:'repeat',children:[]},{id:'child',children:[]}]},{id:'sibling',children:[]}]}]}];
test('focused editor hides ancestors and siblings while preserving the full immutable context',()=>{
  const before=JSON.stringify(nodes),view=outlineView(nodes,'target',{metadata:{repeat:{parentReference:'target'}}});
  assert.deepEqual(view.get('target'),{hidden:false,ancestor:false,current:true});
  for(const id of ['document','parent'])assert.deepEqual(view.get(id),{hidden:false,ancestor:true,current:false});
  for(const id of ['other','sibling','repeat'])assert.equal(view.get(id).hidden,true);
  assert.equal(view.get('child').hidden,false);assert.equal(JSON.stringify(nodes),before);
  assert.equal(outlineView(nodes,'repeat',{metadata:{repeat:{parentReference:'target'}}}).get('repeat').hidden,false,'direct reference navigation still works');
});
test('new-node routes, returning to document and missing routes preserve the same tree',()=>{
  assert.equal(routeNodeId('#node-child'),'child');assert.equal(routeNodeId('#heading'),null);
  assert.equal(outlineView(nodes,'child').get('target').ancestor,true);
  assert.equal(outlineView(nodes,'document').get('other').hidden,false);
  assert.equal(outlineView(nodes,'missing',{inlineRoot:true}).get('document').current,true);
});
test('inline scope keeps edit at the selected node without turning the document into an editor',()=>{
  const view=outlineView(nodes,'document',{scopeId:'target',originalIds:['document','other','parent','target','repeat','child','sibling'],editableIds:['target','child'],metadata:{repeat:{parentReference:'target'}}});
  assert.equal(view.get('document').ancestor,true);assert.equal(view.get('document').current,false);
  assert.equal(view.get('parent').ancestor,true);assert.equal(view.get('other').hidden,true);assert.equal(view.get('sibling').hidden,true);
  assert.equal(view.get('target').hidden,false);assert.equal(view.get('target').current,false);assert.equal(view.get('repeat').hidden,true);
});
test('view projection does not serialize incomplete mentions or rich inline fields',()=>{
  const value=[{type:'ul',children:[{type:'li',id:'node',children:[{type:'lic',children:[{type:'mention_input',children:[{text:'unfinished'}]}]},{type:'ul',children:[{type:'li',id:'child',children:[{type:'lic',children:[{text:'body'}]}]}]}]}]}];
  assert.deepEqual(plateOutlineNodes(value),[{id:'node',children:[{id:'child',children:[]}]}]);
});
test('approval availability mirrors server-owned parent and original edit permissions',()=>{
  const outline={documentId:'document',originalIds:['document','target','other'],editableIds:['target'],sources:{document:{},target:{},other:{}}};
  assert.equal(canAdoptOutlineNode(outline,'target','document'),true);
  assert.equal(canAdoptOutlineNode(outline,'other','document'),false);
  assert.equal(canAdoptOutlineNode(outline,'new','target'),true);
  assert.equal(canAdoptOutlineNode(outline,'grandchild','new'),false);
});
test('moving an editable node outside the scope retains it without exposing readonly context text',()=>{
  const moved=[{id:'document',children:[{id:'target',children:[]},{id:'moved',children:[{id:'new',children:[]}]},{id:'other',children:[]}]}];
  const view=outlineView(moved,'document',{scopeId:'target',originalIds:['document','target','moved','other'],editableIds:['target','moved']});
  assert.equal(view.get('target').hidden,false);assert.equal(view.get('moved').hidden,false);assert.equal(view.get('new').hidden,false);
  assert.equal(view.get('other').hidden,true);assert.equal(view.get('document').ancestor,true);
});
test('editable document grouping reuses the strict ordinary-prefix/document-suffix contract',()=>{
  const metadata={d:{remType:'document'},j:{remType:'dailyDocument'}};
  assert.equal(documentViewSplit([{id:'text'},{id:'d'},{id:'j'}],metadata),1);
  assert.equal(documentViewSplit([{id:'d'},{id:'text'},{id:'j'}],metadata),-1);
  assert.equal(documentViewSplit([{id:'text'},{id:'d'},{id:'last'}],metadata),-1);
  assert.equal(documentViewSplit([{id:'d'},{id:'j'}],metadata),0);
});
