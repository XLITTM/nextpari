import {test} from 'node:test';
import assert from 'node:assert/strict';
import {footballCardToMatch,betsapiDetailLines,isBetsapiMatch,applyFootballQuotes,footballQuoteIds} from './footballFeed.js';
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
test('queues every unpriced live fixture instead of 16 live / 8 quote slots',()=>{
  const matches=Array.from({length:20},(_,index)=>footballCardToMatch({
    ...card,
    id:`oddspapi-v5:id1000002067015${String(index).padStart(3,'0')}`,
    live:true,
    priceState:'unpriced',
    markets:[],
    displayGroups:[],
  }));
  const plan=footballQuoteIds(matches);
  assert.equal(plan.primary.length,20>40?40:20);
  assert.equal(plan.primary.length,20);
  assert.equal(new Set(plan.primary).size,20);
});

test('a detail price refresh retains provider identity and generic market groups',()=>{
  const match=footballCardToMatch({...card,markets:[],displayGroups:[]});
  const [next]=applyFootballQuotes([match],[{...card,markets:card.markets}]);
  assert.equal(next.feedTag,'oddspapi-v5');assert.equal(next.marketGroups?.[0].name,'Тотал · 2.5');
  assert.equal(next.marketsLocked,true);
});
