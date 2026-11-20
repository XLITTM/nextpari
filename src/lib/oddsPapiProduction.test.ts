import {test} from 'node:test';
import assert from 'node:assert/strict';
import {footballCardToMatch,betsapiDetailLines,isBetsapiMatch,applyFootballQuotes} from './footballFeed.js';
const id='oddspapi-v5:id1000002067015472';
const card={id,provider:'oddspapi-v5' as const,league:'League',country:'',home:'Home',away:'Away',kickoff:null,live:true,score:null,priceState:'open' as const,markets:[{key:'1x2' as const,name:'Result',line:'',status:'open' as const,outcomes:[{key:'home',name:'1',price:2},{key:'draw',name:'X',price:3},{key:'away',name:'2',price:4}],updatedAt:new Date().toISOString()}],displayGroups:[{id:id+':total',name:'Тотал · 2.5',category:'totals' as const,outcomes:[{label:'ТБ',odds:1.9,locked:true,updatedAt:new Date().toISOString()}]}]};
test('displays OddsPapi prices in existing match details without creating a selectable bet',()=>{
  const match=footballCardToMatch(card);
  assert.equal(match.feedTag,'oddspapi-v5');assert.equal(isBetsapiMatch(match),true);
  assert.equal(match.marketsLocked,true);assert.deepEqual(match.betsapiQuotes,{});
  assert.equal(match.extraMarkets,2);
  const lines=betsapiDetailLines(match);
  assert.equal(lines.length,2);
  assert.ok(lines.every(l=>l.outcomes.every(o=>o.locked&&!o.selection)));
});
test('a detail price refresh retains provider identity and generic market groups',()=>{
  const match=footballCardToMatch({...card,markets:[],displayGroups:[]});
  const [next]=applyFootballQuotes([match],[{...card,markets:card.markets}]);
  assert.equal(next.feedTag,'oddspapi-v5');assert.equal(next.marketGroups?.[0].name,'Тотал · 2.5');
  assert.equal(next.marketsLocked,true);
});
