import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {compile} from '../prepare.mjs';
import {renderApprovedFragments} from '../../scripts/collaboration-fragments.mjs';
import {createLocalUpdates} from './local-updates.mjs';

function fixture(t){
  const page={id:'r-64',slug:'fixture',title:'Document',nodes:[{id:'r-64',remType:'document',html:'Document',children:[{id:'r-61',remType:'text',html:'Original',children:[{id:'r-63',remType:'text',html:'Retained child'}]},{id:'r-62',remType:'text',html:'Sibling',children:[{id:'r-65',remType:'text',html:'Nested'}]}]}]};
  const dom=new JSDOM(compile({pages:[page]}).get('fixture'),{url:'https://example.test/blog/#node-r-61',runScripts:'outside-only'});t.after(()=>dom.window.close());
  dom.window.matchMedia=()=>({matches:true,addEventListener(){}});dom.window.localStorage.setItem('outline-folds:fixture',JSON.stringify(['node-r-62']));dom.window.eval(fs.readFileSync(new URL('../outline.js',import.meta.url),'utf8'));
  return {dom,doc:dom.window.document,updates:createLocalUpdates(dom.window)};
}
function update(kind='add'){
  const job={kind,nodes:[{id:'root',content:[{text:'New ',bold:true},{text:'<img src=x onerror=alert(1)>'},{type:'math',tex:'x^2',display:false}],children:[{id:'child',content:[{text:'nested'}],children:[]}]}]};
  return {id:'operation-1',kind,parentId:'r-61',fragments:renderApprovedFragments(job,{mapping:{root:kind==='edit'?'a':'f',child:'g'}})};
}
test('local insertion retains unrelated controls, fold, focus and editor selection; repeats are idempotent',t=>{
  const {dom,doc,updates}=fixture(t),sibling=doc.getElementById('node-r-62'),controls=sibling.querySelector('.outline-controls');
  const editor=doc.createElement('textarea');editor.value='unsaved';doc.body.append(editor);editor.focus();editor.setSelectionRange(2,4);
  const value=update();updates.apply('r-61',[value]);updates.apply('r-61',[value]);
  assert.equal(doc.querySelectorAll('#node-r-66').length,1);assert.equal(doc.getElementById('node-r-66').parentElement.closest('.outline-node').id,'node-r-61');
  assert.equal(sibling.querySelector('.outline-controls'),controls);assert(sibling.classList.contains('is-folded'));assert.equal(dom.window.location.hash,'#node-r-61');
  assert.equal(doc.activeElement,editor);assert.equal(editor.value,'unsaved');assert.equal(editor.selectionStart,2);
  assert.equal(doc.querySelectorAll('img,script').length,0);assert(doc.querySelector('#node-r-66 math'));
  updates.clear();assert.equal(doc.getElementById('node-r-66'),null);assert(doc.getElementById('node-r-63'));assert.equal(sibling.querySelector('.outline-controls'),controls);
});
test('editing patches only text, retains existing children and exact node identity, and logout restores source',t=>{
  const {doc,updates}=fixture(t),target=doc.getElementById('node-r-61'),child=doc.getElementById('node-r-63');
  updates.apply('r-61',[update('edit')]);assert.equal(doc.getElementById('node-r-61'),target);assert.equal(doc.getElementById('node-r-63'),child);assert.match(target.querySelector(':scope > .node-content').textContent,/New/);
  updates.apply('r-61',[]);assert.equal(target.querySelector(':scope > .node-content').textContent,'Original');assert.equal(doc.getElementById('node-r-67'),null);
});
test('wrong roots, duplicate descendant identities and unrelated parents cannot modify another branch',t=>{
  const {doc,updates}=fixture(t);const value=update();value.parentId='r-62';assert.throws(()=>updates.apply('r-61',[value]),/父级/);assert.equal(doc.getElementById('node-r-66'),null);
  const bad=update();bad.fragments[0].html=bad.fragments[0].html.replace('node-r-67','node-r-62');assert.throws(()=>updates.apply('r-61',[bad]),/身份冲突/);assert.equal(doc.querySelectorAll('#node-r-62').length,1);
});
