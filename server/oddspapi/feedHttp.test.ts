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
  assert.equal(card.displayGroups.filter((group)=>group.marketFamily==='1x2').length,1);
  assert.equal(card.displayGroups.find((group)=>group.marketFamily==='1x2')?.outcomes[0]?.label,'П1');
  const totals=card.displayGroups.filter((group)=>group.marketFamily==='totals');
  assert.equal(totals.length,2);
  assert.match(totals[0].name,/2\.5/);
  assert.equal(totals[0].outcomes[0]?.label,'Больше');
  assert.match(totals[1].name,/3\.5/);
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
  const unnamed=v5FixtureToCard(fixture({participants:{}}),catalog,now);
  assert.equal(unnamed?.home,'');
  assert.equal(unnamed?.away,'');
  assert.equal(unnamed?.id,'oddspapi-v5:'+fixtureId);
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
test('names a missing market catalog separately from an unsafe bookmaker',()=>{
  const card=v5FixtureToCard(fixture(),null,now)!;
  assert.equal(card.displayGroups.length,0);
  assert.equal(card.priceAudit.rejectionReasons['market-catalog-unavailable'],7);
});
test('keeps distinct player prices and numeric exact-goal labels in the same snapshot',()=>{
  const row=fixture();
  const odds=row.odds as { '1xbet': Record<string, unknown> };
  odds['1xbet'][`${fixtureId}:1xbet:501:0`]={bookmaker:'1xbet',outcomeId:501,marketId:501,price:4.2,active:true,changedAt:now};
  odds['1xbet'][`${fixtureId}:1xbet:801:44`]={bookmaker:'1xbet',outcomeId:801,marketId:801,price:1.8,active:true,changedAt:now};
  odds['1xbet'][`${fixtureId}:1xbet:801:55`]={bookmaker:'1xbet',outcomeId:801,marketId:801,price:2.2,active:true,changedAt:now};
  const extra=indexV5Markets([...markets,
    {marketId:501,marketName:'Exact Goals',marketType:'exactscore',period:'fulltime',handicap:0,outcomes:[{outcomeId:501,outcomeName:'1'}]},
    {marketId:801,marketName:'Player To Score',marketType:'players-toscore',period:'fulltime',handicap:0,outcomes:[{outcomeId:801,outcomeName:'Yes'}]},
  ]);
  const card=v5FixtureToCard(row,extra,now)!;
  const exact=card.displayGroups.find((group)=>group.marketFamily==='exactscore');
  const players=card.displayGroups.find((group)=>group.marketFamily==='players-toscore');
  assert.deepEqual(exact?.outcomes.map((outcome)=>outcome.label),['1']);
  assert.deepEqual(players?.outcomes.map((outcome)=>outcome.sourceSelectionId),[`${fixtureId}:1xbet:801:44`,`${fixtureId}:1xbet:801:55`]);
  assert.equal(card.priceAudit.rawBookmakerPrices,10);
  assert.equal(card.priceAudit.acceptedQuotes,10);
  assert.equal(card.priceAudit.displayedPrices,10);
  assert.deepEqual(card.priceAudit.rejectionReasons,{});
});
test('keeps every same-league live fixture instead of one per competition', async () => {
  const env = { ODDSPAPI_V5_API_KEY: 'unit-test-only' };
  const rows = [1, 2, 3, 4, 5].map((index) => {
    const id = `id10000020670154${70 + index}`;
    return fixture({
      fixtureId: id,
      participants: { participant1Name: `Home ${index}`, participant2Name: `Away ${index}` },
      tournament: { tournamentName: 'Premier League', categoryName: 'England' },
      odds: { '1xbet': Object.fromEntries([101, 102, 103].map((outcomeId) => [
        `${id}:1xbet:${outcomeId}:0`,
        { bookmaker: '1xbet', outcomeId, marketId: 101, price: 2.1, active: true, changedAt: now },
      ])) },
    });
  });
  const reader = new OddsPapiV5TrialReader({
    env,
    fetchImpl: async (raw) => {
      const path = new URL(String(raw)).pathname;
      if (path.endsWith('/markets')) return new Response(JSON.stringify(markets), { status: 200 });
      if (path.endsWith('/live') || path.endsWith('/fixtures') || path.endsWith('/today') || path.endsWith('/main')) {
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      return new Response(JSON.stringify(rows[0]), { status: 200 });
    },
  });
  const listed = await handleV5SportsFeed({ url: '/' }, env, reader);
  const events = (listed.body as { events?: Array<{ league: string; id: string }>; pipeline?: { selected: number } }).events ?? [];
  assert.equal(events.length, 5);
  assert.equal(events.filter((event) => event.league === 'Premier League').length, 5);
  assert.equal((listed.body as { pipeline?: { selected: number } }).pipeline?.selected, 5);
  assert.equal(listed.body.betsAccepted, false);
});

test('does not cap the football catalog at 16 live, 24 prematch or 40 fixtures', async () => {
  const env = { ODDSPAPI_V5_API_KEY: 'unit-test-only' };
  const liveRows = Array.from({ length: 18 }, (_, index) => fixture({
    fixtureId: `id10000020670155${String(index).padStart(2, '0')}`,
    status: { live: true },
    tournament: { tournamentName: `League ${index}`, categoryName: 'England' },
    participants: { participant1Name: `L${index}H`, participant2Name: `L${index}A` },
    startTime: Math.floor(now / 1000) - 60,
    odds: { '1xbet': {} },
    bookmakers: { '1xbet': { hasOdds: true, staleOdds: false, suspended: false, participantsRotated: false } },
  }));
  const lineRows = Array.from({ length: 26 }, (_, index) => fixture({
    fixtureId: `id10000020670156${String(index).padStart(2, '0')}`,
    status: { live: false },
    tournament: { tournamentName: `Line ${index}`, categoryName: 'Spain' },
    participants: { participant1Name: `P${index}H`, participant2Name: `P${index}A` },
    startTime: Math.floor(now / 1000) + 3600 + index,
    odds: { '1xbet': {} },
    bookmakers: { '1xbet': { hasOdds: true, staleOdds: false, suspended: false, participantsRotated: false } },
  }));
  const reader = new OddsPapiV5TrialReader({
    env,
    fetchImpl: async (raw) => {
      const path = new URL(String(raw)).pathname;
      if (path.endsWith('/markets')) return new Response(JSON.stringify(markets), { status: 200 });
      if (path.endsWith('/live')) return new Response(JSON.stringify(liveRows), { status: 200 });
      if (path.endsWith('/fixtures') || path.endsWith('/today')) return new Response(JSON.stringify(lineRows), { status: 200 });
      return new Response(JSON.stringify(liveRows[0]), { status: 200 });
    },
  });
  const listed = await handleV5SportsFeed({ url: '/' }, env, reader);
  const body = listed.body as { events?: unknown[]; featuredLive?: unknown[]; pipeline?: { selected: number; normalized: number } };
  assert.equal(body.events?.length, 44);
  assert.equal(body.pipeline?.selected, 44);
  assert.ok((body.featuredLive?.length ?? 0) <= 8);
});

test('uses regulation 1X2 on hockey cards when an overtime winner is also present', () => {
  const hockey = fixture({
    sport: { sportId: 15 },
    odds: {
      '1xbet': {
        [`${fixtureId}:1xbet:401:0`]: { bookmaker: '1xbet', outcomeId: 401, marketId: 401, price: 2.4, active: true, changedAt: now },
        [`${fixtureId}:1xbet:402:0`]: { bookmaker: '1xbet', outcomeId: 402, marketId: 401, price: 3.1, active: true, changedAt: now },
        [`${fixtureId}:1xbet:403:0`]: { bookmaker: '1xbet', outcomeId: 403, marketId: 401, price: 3.4, active: true, changedAt: now },
        [`${fixtureId}:1xbet:501:0`]: { bookmaker: '1xbet', outcomeId: 501, marketId: 501, price: 1.9, active: true, changedAt: now },
        [`${fixtureId}:1xbet:502:0`]: { bookmaker: '1xbet', outcomeId: 502, marketId: 501, price: 1.9, active: true, changedAt: now },
      },
    },
  });
  const hockeyCatalog = indexV5Markets([
    { marketId: 401, marketName: 'Regulation', marketType: '1x2', period: 'fulltime', handicap: 0, outcomes: [{ outcomeId: 401, outcomeName: '1' }, { outcomeId: 402, outcomeName: 'X' }, { outcomeId: 403, outcomeName: '2' }] },
    { marketId: 501, marketName: 'Including OT', marketType: 'moneyline', period: 'result', handicap: 0, outcomes: [{ outcomeId: 501, outcomeName: '1' }, { outcomeId: 502, outcomeName: '2' }] },
  ]);
  const card = v5FixtureToCard(hockey, hockeyCatalog, now)!;
  assert.equal(card.sport, 'hockey');
  assert.equal(card.markets[0]?.key, '1x2');
  assert.equal(card.markets[0]?.outcomes.length, 3);
  assert.equal(card.markets[0]?.externalMarketId, '401');
});

test('uses a full-match basketball winner when 1X2 and moneyline both exist', () => {
  const basketball = fixture({
    sport: { sportId: 11 },
    odds: {
      '1xbet': {
        [`${fixtureId}:1xbet:201:0`]: { bookmaker: '1xbet', outcomeId: 201, marketId: 201, price: 1.8, active: true, changedAt: now },
        [`${fixtureId}:1xbet:202:0`]: { bookmaker: '1xbet', outcomeId: 202, marketId: 201, price: 2.1, active: true, changedAt: now },
        [`${fixtureId}:1xbet:301:0`]: { bookmaker: '1xbet', outcomeId: 301, marketId: 301, price: 1.7, active: true, changedAt: now },
        [`${fixtureId}:1xbet:302:0`]: { bookmaker: '1xbet', outcomeId: 302, marketId: 301, price: 2.2, active: true, changedAt: now },
        [`${fixtureId}:1xbet:303:0`]: { bookmaker: '1xbet', outcomeId: 303, marketId: 301, price: 4.5, active: true, changedAt: now },
      },
    },
  });
  const basketballCatalog = indexV5Markets([
    { marketId: 201, marketName: 'Winner', marketType: 'moneyline', period: 'result', handicap: 0, outcomes: [{ outcomeId: 201, outcomeName: '1' }, { outcomeId: 202, outcomeName: '2' }] },
    { marketId: 301, marketName: 'Regulation', marketType: '1x2', period: 'fulltime', handicap: 0, outcomes: [{ outcomeId: 301, outcomeName: '1' }, { outcomeId: 302, outcomeName: '2' }, { outcomeId: 303, outcomeName: 'X' }] },
  ]);
  const card = v5FixtureToCard(basketball, basketballCatalog, now)!;
  assert.equal(card.sport, 'basketball');
  assert.equal(card.markets[0]?.key, 'moneyline');
  assert.equal(card.markets[0]?.outcomes.length, 2);
  assert.equal(card.markets[0]?.externalMarketId, '201');
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
