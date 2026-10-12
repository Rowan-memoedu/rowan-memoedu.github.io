import test from 'node:test';
import assert from 'node:assert/strict';
import {byDeadline,civilDate,overdue,createWorkspaceClient,asFeature} from './model.mjs';

test('deadline ordering preserves undated tasks and civil dates including leap days',()=>{
  const rows=[{id:'c',deadline:null,position:1},{id:'b',deadline:'2028-02-29T18:00',position:2},{id:'a',deadline:'2028-02-29T09:00',position:0}];
  assert.deepEqual(rows.sort(byDeadline).map(t=>t.id),['a','b','c']);
  const date=civilDate('2028-02-29T18:30');assert.deepEqual([date.getFullYear(),date.getMonth(),date.getDate(),date.getHours(),date.getMinutes()],[2028,1,29,18,30]);
  assert(overdue({status:'doing',deadline:'2028-02-29T18:00'},'2028-02-29T18:01'));
  assert(!overdue({status:'done',deadline:'2028-02-29T18:00'},'2028-03-01T18:01'));
});

test('timeline labels preserve Beijing time even inside a browser daylight-saving gap',()=>{
  const previous=process.env.TZ;
  try{
    process.env.TZ='America/Los_Angeles';
    const feature=asFeature({id:'dst',title:'时区边界',status:'todo',deadline:'2027-03-14T02:30'});
    assert.equal(feature.endAt.getHours(),3,'The browser timezone really has a missing 02:30');
    assert.equal(feature.deadlineLabel,'03-14 02:30');
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('an unknown network outcome keeps its request identity; successful new actions do not',async()=>{
  const bodies=[];let fail=true;
  const reader={epoch:1,authenticated:true,async request(route,options){bodies.push(JSON.parse(options.body));if(fail){fail=false;throw Error('network interrupted');}return new Response('{}');}};
  const api=createWorkspaceClient(reader),fields={projectId:'p',fields:{title:'same task'}};
  await assert.rejects(api.post('tasks/save',fields));await api.post('tasks/save',fields);await api.post('tasks/save',fields);
  assert.equal(bodies[0].requestId,bodies[1].requestId);assert.notEqual(bodies[1].requestId,bodies[2].requestId);
});

test('logout while a response body is pending cannot deliver private data',async()=>{
  let finish;const reader={epoch:1,authenticated:true,async request(){return {json:()=>new Promise(resolve=>{finish=resolve;})};}};
  const api=createWorkspaceClient(reader),pending=api.get('projects');await Promise.resolve();reader.epoch++;reader.authenticated=false;finish({projects:[{name:'secret'}]});
  await assert.rejects(pending,{name:'AbortError'});
});
