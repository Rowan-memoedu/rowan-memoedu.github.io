import test from 'node:test';
import assert from 'node:assert/strict';
import {discussionTarget} from './discussion-target.mjs';
test('editing an existing node uses exactly the normal node comment context',()=>{
  const p={id:'p1',kind:'edit',editRootId:'r-61',nodes:[{id:'r-61'}]};
  assert.deepEqual(discussionTarget(p,'r-61','r-61'),{anchorId:'r-61'});
  assert.deepEqual(discussionTarget(p,'new-child','r-61'),{anchorId:'r-61',proposalId:'p1',proposalNodeId:'new-child'});
});
test('existing outline nodes, including surrounding readonly rows, retain native targets',()=>{
  const p={id:'p2',kind:'outline',outline:{originalIds:['r-64'],sources:{'r-61':{},'r-62':{nodeId:'r-63'}}}};
  assert.deepEqual(discussionTarget(p,'r-61','r-62'),{anchorId:'r-61'});
  assert.deepEqual(discussionTarget(p,'r-62','r-62'),{anchorId:'r-63'});
  assert.deepEqual(discussionTarget(p,'r-64','r-62'),{anchorId:'r-64'});
  assert.deepEqual(discussionTarget(p,'new','r-62'),{anchorId:'r-62',proposalId:'p2',proposalNodeId:'new'});
});
test('unpublished local adoption retains its permission-checked temporary discussion context',()=>{
  const p={id:'p3',kind:'outline',outline:{sources:{local:{nodeId:'r-64',publicationPending:true}}}};
  assert.deepEqual(discussionTarget(p,'local','r-62'),{anchorId:'r-62',proposalId:'p3',proposalNodeId:'local'});
});
