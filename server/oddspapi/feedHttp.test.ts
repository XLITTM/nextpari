import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearV5FeedCache, handleV5SportsFeed, v5FixtureToCard } from './feedHttp.js';
import { indexV5Markets } from './canonical.js';
import { OddsPapiV5TrialReader } from './v5TrialClient.js';
import placeHandler from '../../api/player/sports/place.js';
const now=Date.now();
const fixtureId='id1000002067015472';
function fixture(extra:Record<string,unknown>={}) {
  return {fixtureId,sport:{sportId:10},participants:{participant1Id:1,participant2Id:2,participant1Name:'Home',participant2Name:'Away'},tournament:{tournamentName:'League',categoryName:'Country'},status:{live:true},startTime:Math.floor(now/1000),bookmakers:{'1xbet':{hasOdds:true,staleOdds:false,suspended:false,participantsRotated:false}},odds:{'1xbet':Object.fromEntries([101,102,103,106,107,108,109].map(outcomeId=>[`${fixtureId}:1xbet:${outcomeId}:0`,{bookmaker:'1xbet',outcomeId,marketId:outcomeId<=103?101:outcomeId<=107?106:108,price:2.1,active:true,changedAt:now}]))},...extra};
}
const markets=[{marketId:101,marketName:'Full Time Result',marketType:'1x2',period:'fulltime',handicap:0,outcomes:[{outcomeId:101,outcomeName:'1'},{outcomeId:102,outcomeName:'X'},{outcomeId:103,outcomeName:'2'}]},...[106,108].map((id,i)=>({marketId:id,marketName:'Total',marketType:'totals',period:'fulltime',handicap:2.5+i,outcomes:[{outcomeId:id,outcomeName:'Over'},{outcomeId:id+1,outcomeName:'Under'}]}))];
const catalog=indexV5Markets(markets);
beforeEach(clearV5FeedCache);
test('keeps provider ids and exact lines and locks every displayed outcome',()=>{
  const card=v5FixtureToCard(fixture(),catalog,now)!;
  assert.equal(card.id,'oddspapi-v5:'+fixtureId);
  assert.equal(card.markets[0].outcomes.length,3);
  assert.equal(card.displayGroups.length,2);
  assert.match(card.displayGroups[0].name,/2\.5/);
  assert.match(card.displayGroups[1].name,/3\.5/);
  assert.ok(card.displayGroups.every(g=>g.outcomes.every(o=>o.locked)));
});
test('hides suspended, stale, unknown, or rotated bookmaker prices',()=>{
  for(const flags of [{suspended:true},{staleOdds:true},{participantsRotated:true},{participantsRotated:undefined}]) {
    const f=fixture();const b=f.bookmakers['1xbet'];
    const card=v5FixtureToCard({...f,bookmakers:{'1xbet':{...b,...flags}}},catalog,now)!;
    assert.deepEqual(card.markets,[]);assert.deepEqual(card.displayGroups,[]);
  }
});
test('does not invent names or a running clock',()=>{
  assert.equal(v5FixtureToCard(fixture({participants:{}}),catalog,now),null);
  const card=v5FixtureToCard(fixture({clock:{currentTime:'89:12',currentPeriod:'p2',stopped:true,updatedAt:new Date(now).toISOString()}}),catalog,now)!;
  assert.equal(card.liveClock?.running,false);assert.equal(card.liveClock?.minute,89);
  assert.equal(v5FixtureToCard(fixture(),catalog,now)?.liveClock,null);
});
test('a fresh non-stale display snapshot can show an unchanged old price',()=>{
  const f=fixture();
  for(const quote of Object.values(f.odds['1xbet']))quote.changedAt=now-24*60*60*1000;
  const card=v5FixtureToCard(f,catalog,now)!;
  assert.equal(card.markets[0].outcomes[0].price,2.1);
  assert.ok(card.displayGroups.every(g=>g.outcomes.every(o=>o.locked)));
});
test('rejects incorrect ids and methods before using the provider',async()=>{
  const env={ODDSPAPI_V5_API_KEY:'test-key-never-real'};
  assert.equal((await handleV5SportsFeed({method:'POST'},env)).status,405);
  assert.equal((await handleV5SportsFeed({url:'/?eventId=12345'},env)).status,404);
});
test('serves real-shaped lists, details and quote batches with betting closed',async()=>{
  const calls:string[]=[];
  const reader=new OddsPapiV5TrialReader({env:{ODDSPAPI_V5_API_KEY:'unit-test-only'},fetchImpl:async raw=>{
    const u=new URL(String(raw));calls.push(u.pathname);
    const data=u.pathname.endsWith('/markets')?markets:u.pathname.endsWith('/odds')?fixture():[fixture()];
    return new Response(JSON.stringify(data),{status:200});
  }});
  const env={ODDSPAPI_V5_API_KEY:'unit-test-only'};
  const listed=await handleV5SportsFeed({url:'/'},env,reader);
  assert.equal(listed.status,200);assert.equal(listed.body.betsAccepted,false);
  assert.equal((listed.body as {events?:unknown[]}).events?.length,1);
  const detail=await handleV5SportsFeed({url:'/?eventId=oddspapi-v5:'+fixtureId},env,reader);
  assert.equal(detail.status,200);
  const batch=await handleV5SportsFeed({url:'/?oddsFor=oddspapi-v5:'+fixtureId},env,reader);
  assert.equal(batch.status,200);assert.equal(batch.body.betsAccepted,false);
  assert.equal(calls.filter(p=>p.endsWith('/odds')).length,1,'shares the fresh request cache');
});
test('a provider 429 keeps the cached board instead of returning an empty sportsbook', async () => {
  let liveCalls = 0;
  let todayCalls = 0;
  const row = fixture();
  const reader = {
    async live() {
      liveCalls += 1;
      return { ok: true, status: 200, error: null, data: [row] };
    },
    async today() {
      todayCalls += 1;
      return { ok: false, status: 429, error: 'RATE_LIMITED', data: null, retryAfterMs: 5_000 };
    },
    async markets() {
      return { ok: true, status: 200, error: null, data: markets };
    },
    async fixtureOdds() {
      return { ok: true, status: 200, error: null, data: row };
    },
  } as unknown as OddsPapiV5TrialReader;
  const env = { ODDSPAPI_V5_API_KEY: 'unit-test-only' };
  const first = await handleV5SportsFeed({ url: '/' }, env, reader);
  const second = await handleV5SportsFeed({ url: '/' }, env, reader);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((second.body as { events?: unknown[]; rateLimited?: boolean }).events?.length, 1);
  assert.equal((second.body as { rateLimited?: boolean }).rateLimited, true);
  assert.equal(liveCalls, 1);
  assert.equal(todayCalls, 1);
});
test('the deployed place endpoint refuses before session or wallet access',async()=>{
  const old=process.env.ODDSPAPI_V5_READONLY_FEED;
  process.env.ODDSPAPI_V5_READONLY_FEED='1';
  let status=0;let body:unknown;
  try {
    await placeHandler({method:'POST',headers:{},body:{stake:100}}, {status:code=>status=code,setHeader:()=>{},json:value=>body=value});
    assert.equal(status,503);assert.deepEqual(body,{ok:false,error:'SPORTSBOOK_EMERGENCY_STOP'});
  } finally {if(old===undefined)delete process.env.ODDSPAPI_V5_READONLY_FEED;else process.env.ODDSPAPI_V5_READONLY_FEED=old;}
});
