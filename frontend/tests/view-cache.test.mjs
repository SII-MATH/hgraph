import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({server:{middlewareMode:true},appType:'custom'});
after(()=>server.close());
const {retainViews}=await server.ssrLoadModule('/src/viewCache.ts');
test('only visited views are retained, recent views survive bounded eviction',()=>{
  let keys=[];
  for(const key of ['a','b','c','a','d']) keys=retainViews(keys,key,3);
  assert.deepEqual(keys,['c','a','d']);
  assert.deepEqual(retainViews(keys,null,3),keys);
  assert.deepEqual(retainViews(keys,'d',3),keys);
  assert.deepEqual(retainViews([],null,3),[]);
  assert.deepEqual(retainViews(keys,'e',1),['e']);
});
