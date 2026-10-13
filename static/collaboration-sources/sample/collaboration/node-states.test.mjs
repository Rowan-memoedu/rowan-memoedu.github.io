import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createNodeStates} from './node-states.mjs';

test('a saved website Todo exists offline, keeps its DOM on native acknowledgement and disappears on logout',()=>{
  const {window}=new JSDOM('<ul><li class="outline-node" id="node-r-61"><div class="node-content">Doc</div></li></ul>',{url:'https://website.invalid/blog/#node-task-local'});
  const states=createNodeStates(window),doc=window.document;
  states.apply([{nodeId:'task-local',parentId:'r-61',local:true,title:'<script>literal</script>',todoState:'Unfinished',canEdit:true}]);
  const node=doc.getElementById('node-task-local');assert(node);assert.equal(node.querySelector('script'),null);
  states.apply([{nodeId:'r-62',previousIds:['task-local'],parentId:'r-61',local:false,todoState:'Finished',canEdit:true}]);
  assert.equal(doc.getElementById('node-r-62'),node);assert.equal(node.dataset.todoEditable,'true');assert.equal(node.dataset.todoState,'Finished');assert.equal(window.location.hash,'#node-r-62');
  states.clear();assert.equal(doc.querySelectorAll('.outline-node').length,1);window.close();
});

test('native moves, completion and restored identities share ordinary document DOM and undo on logout',()=>{
  const {window}=new JSDOM('<div class="reading-outline"><ul><li class="outline-node" id="node-r-61"><div class="node-content">A</div><ul><li class="outline-node" id="node-r-63"><div class="node-content"><b>Original</b></div></li></ul></li><li class="outline-node" id="node-r-62" data-document-layout="split"><div class="node-content">B</div><div class="document-body"></div></li></ul></div>');
  const doc=window.document,node=doc.getElementById('node-r-63'),source=node.querySelector('b'),originalParent=node.parentNode,states=createNodeStates(window);
  states.apply([{nodeId:'r-64',previousIds:['r-63'],parentId:'r-62',todoState:'Finished',archived:false,canEdit:true}]);
  assert.equal(doc.querySelectorAll('#node-r-64').length,1);assert.equal(node.querySelector('b'),source);
  assert.equal(node.parentElement.closest('.outline-node').id,'node-r-62');assert.equal(node.dataset.todoEditable,'true');
  assert(node.closest('.document-annotations .callout-content'));
  states.apply([{nodeId:'r-64',parentId:'r-62',todoState:'Finished',archived:true,canEdit:true}]);
  assert.equal(node.dataset.collaborationArchived,'true');assert.equal(node.dataset.todoEditable,'false');
  states.clear();assert.equal(node.id,'node-r-63');assert.equal(node.parentNode,originalParent);assert.equal(node.dataset.todoState,undefined);
  assert.equal(doc.querySelector('#node-r-62 .document-annotations'),null);window.close();
});

test('clearing a session cannot reinsert a source node removed by a newer authorized fragment',()=>{
  const {window}=new JSDOM('<ul><li class="outline-node" id="node-r-61"><div class="node-content">Original</div></li></ul>');
  const doc=window.document,states=createNodeStates(window),old=doc.getElementById('node-r-61');
  states.apply([{nodeId:'r-61',todoState:'Unfinished',archived:false,canEdit:true}]);
  const next=old.cloneNode(true);old.replaceWith(next);states.apply([{nodeId:'r-61',todoState:'Finished',archived:false,canEdit:false}]);
  states.clear();assert.equal(doc.querySelectorAll('#node-r-61').length,1);assert.equal(doc.getElementById('node-r-61'),next);window.close();
});
