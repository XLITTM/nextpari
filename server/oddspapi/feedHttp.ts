import type { FootballFeedCard, FootballFeedMarket } from '../betsapi/footballFeedHttp.js';
import type { MarketCategory, MarketGroup } from '../../src/types.js';
import { indexV5Markets, isFullTimeMainMarket, presentV5Quotes, type V5MarketDefinition } from './canonical.js';
import { clearV5RequestSchedule, scheduledRead, V5_DOCUMENTED_LIMITS, V5_REQUEST_GAPS } from './requestSchedule.js';
import { OddsPapiV5TrialReader, V5_SPORT_IDS, type JsonRecord, type V5Result } from './v5TrialClient.js';

export const V5_EVENT_PREFIX = 'oddspapi-v5:';
type Card = FootballFeedCard & { provider: 'oddspapi-v5'; displayGroups: MarketGroup[]; observedAt: string };
const SPORTS: Record<number, Card['sport']> = {10:'football',11:'basketball',12:'tennis',15:'hockey',16:'esports',17:'esports',18:'esports',23:'volleyball',25:'table-tennis',61:'esports'};
export function clearV5FeedCache(): void { clearV5RequestSchedule(); }
function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function rows(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function name(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function sourceId(id: string): string | null { return /^oddspapi-v5:id\d{8,32}$/.test(id) ? id.slice(V5_EVENT_PREFIX.length) : null; }
function keepMsFor(key: string): number {
  if (key.startsWith('odds:')) return 10 * 60_000;
  if (key.startsWith('live:')) return 15 * 60_000;
  if (key.startsWith('markets:')) return 6 * 60 * 60_000;
  return 30 * 60_000;
}
async function cached<T>(key: string, freshMs: number, load: () => Promise<V5Result<T>>) {
  return scheduledRead(key, freshMs, keepMsFor(key), load);
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (item:T)=>Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length); let index=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{ for (;;) {const i=index++; if(i>=items.length)return; output[i]=await fn(items[i]);} }));
  return output;
}
function groupCategory(m: V5MarketDefinition): MarketCategory {
  if(m.period==='p1')return '1st-half';
  if(m.period==='p2')return '2nd-half';
  if(/corner/i.test(m.marketName))return 'corners';
  if(/card/i.test(m.marketName))return 'cards';
  if(/total/i.test(m.marketType))return 'totals';
  if(/handicap|spread/i.test(m.marketType))return 'handicaps';
  return 'main';
}
function displayMarketName(m: V5MarketDefinition): string {
  const translated: Record<string,string> = {'1x2':'Исход',moneyline:'Победитель',bothteamsscore:'Обе забьют',totals:'Тотал',handicap:'Фора',doublechance:'Двойной шанс',correctscore:'Точный счёт'};
  const base = translated[m.marketType] || m.marketName;
  const period = m.period==='p1'?'1-й период':m.period==='p2'?'2-й период':m.period && !['fulltime','result'].includes(m.period)?m.period:'';
  const line = /total|handicap|spread/.test(m.marketType) && m.handicap!==null ? String(m.handicap) : '';
  return [period,base,line].filter(Boolean).join(' · ');
}
function outcomeLabel(value:string): string { return ({'1':'П1',X:'X','2':'П2',Over:'ТБ',Under:'ТМ',Yes:'Да',No:'Нет'} as Record<string,string>)[value] || value; }

export function v5FixtureToCard(f: JsonRecord, catalog: ReturnType<typeof indexV5Markets> | null, now = Date.now(), options?: { snapshotStale?: boolean }): Card | null {
  const id=name(f.fixtureId); const sportId=record(f.sport).sportId;
  if(!/^id\d{8,32}$/.test(id)||typeof sportId!=='number'||!SPORTS[sportId])return null;
  const participants=record(f.participants); const tournament=record(f.tournament); const status=record(f.status);
  const home=name(participants.participant1Name); const away=name(participants.participant2Name);
  if(!home||!away)return null;
  const bookmaker=record(record(f.bookmakers)['1xbet']);
  const safe=bookmaker.hasOdds===true && bookmaker.staleOdds===false && bookmaker.suspended===false && bookmaker.participantsRotated===false;
  const quotes=safe&&catalog?presentV5Quotes(f,catalog,now,{freshReadOnlySnapshot:true}).accepted.filter(q=>q.sourceSelectionId.endsWith(':0')):[];
  const groups=new Map<number,MarketGroup>();
  for(const quote of quotes) {
    const market=catalog!.byId.get(quote.marketId)!;
    const group=groups.get(quote.marketId)||{id:`${V5_EVENT_PREFIX}${id}:market:${quote.marketId}`,name:displayMarketName(market),category:groupCategory(market),outcomes:[],bookmakerId:'1xbet',externalPeriodId:market.period,externalMarketId:String(quote.marketId)};
    group.outcomes.push({label:outcomeLabel(quote.outcomeName),odds:quote.price,locked:true,sourceSelectionId:quote.sourceSelectionId,updatedAt:new Date(now).toISOString()});
    groups.set(quote.marketId,group);
  }
  const mainIds=[...groups.keys()].filter(id=>isFullTimeMainMarket(catalog!.byId.get(id)!));
  const mainId=mainIds.length===1?mainIds[0]:null;
  const main=mainId===null?null:groups.get(mainId)!;
  const outcomes=main?.outcomes.flatMap(o=>{const key=o.label==='П1'?'home':o.label==='П2'?'away':o.label==='X'?'draw':null;return key?[{key,name:o.label,price:o.odds,sourceSelectionId:o.sourceSelectionId}]:[];})||[];
  const markets:FootballFeedMarket[]=outcomes.some(o=>o.key==='home')&&outcomes.some(o=>o.key==='away')?[{key:outcomes.some(o=>o.key==='draw')?'1x2':'moneyline',name:'Исход',line:'',status:'open',outcomes,updatedAt:new Date(now).toISOString(),bookmakerId:'1xbet',externalPeriodId:main!.externalPeriodId||null,externalMarketId:String(mainId)}]:[];
  const score=record(record(f.scores).result); const clock=record(f.clock);
  const at=Date.parse(name(clock.updatedAt)); const time=/^(\d{1,3}):(\d{2})$/.exec(name(clock.currentTime));
  const live=status.live===true;
  const liveClock=live&&sportId===10&&time&&Number(time[2])<60&&Number.isFinite(at)?{minute:Number(time[1]),second:Number(time[2]),running:clock.stopped===false,observedAt:new Date(at).toISOString(),stale:now-at>90_000||at>now+60_000}:null;
  const kickoff=Number(f.startTime)*1000;
  const card: Card = {
    id:V5_EVENT_PREFIX+id,provider:'oddspapi-v5',sport:SPORTS[sportId],tier:sportId===10?1:3,
    logos:{competitionId:null,competition:null,home:null,away:null},league:name(tournament.tournamentName),country:name(tournament.categoryName),home,away,
    kickoff:Number.isFinite(kickoff)&&kickoff>1e12?new Date(kickoff).toISOString():null,live,
    score:typeof score.participant1Score==='number'&&typeof score.participant2Score==='number'?{home:score.participant1Score,away:score.participant2Score}:null,
    liveClock,period:sportId===10&&clock.currentPeriod==='p1'?'first_half':sportId===10&&clock.currentPeriod==='p2'?'second_half':null,
    priceState:bookmaker.suspended===true?'suspended':bookmaker.staleOdds!==false?'stale':groups.size?'open':safe?'unpriced':'unavailable',markets,
    displayGroups:[...groups.values()].filter(g=>g!==main).sort((a,b)=>Number(a.externalMarketId)-Number(b.externalMarketId)),observedAt:new Date(now).toISOString(),
  };
  if (options?.snapshotStale && card.priceState === 'open') card.priceState = 'stale';
  return card;
}

export async function handleV5SportsFeed(input:{method?:string;url?:string}, env:NodeJS.ProcessEnv=process.env, reader=new OddsPapiV5TrialReader({env,timeoutMs:6_000})) {
  const base={source:'oddspapi-v5',betsAccepted:false,websocket:'not-running'};
  if((input.method||'GET').toUpperCase()!=='GET')return {status:405,body:{...base,ok:false,error:'METHOD_NOT_ALLOWED'}};
  if(!String(env.ODDSPAPI_V5_API_KEY||'').trim())return {status:503,body:{...base,ok:false,error:'NOT_CONFIGURED',events:[]}};
  const params=new URL(input.url||'/', 'https://nextpari.net').searchParams;
  async function catalog(sportId:number) {const r=await cached(`markets:${sportId}`,600_000,()=>reader.markets(sportId));return r.ok?indexV5Markets(r.data):null;}
  async function detail(id:string) {
    const r=await cached(`odds:${id}`,15_000,()=>reader.fixtureOdds(id));
    if(!r.ok||!r.data)return {card:null,result:r};
    if(r.data.fixtureId!==id)return {card:null,result:r};
    const sportId=record(r.data.sport).sportId;
    const cat=typeof sportId==='number'&&SPORTS[sportId]?await catalog(sportId):null;
    return {card:v5FixtureToCard(r.data,cat,Date.now(),{snapshotStale:r.snapshotStale}),result:r};
  }
  if(params.has('eventId')) {
    const id=sourceId(params.get('eventId')||''); if(!id)return {status:404,body:{...base,ok:false,error:'NOT_FOUND',events:[]}};
    const {card,result}=await detail(id);
    return {status:card?200:result.ok?404:503,body:{...base,ok:Boolean(card),error:result.error,events:card?[card]:[]}};
  }
  if(params.has('oddsFor')) {
    const ids=[...new Set((params.get('oddsFor')||'').split(',').filter(id=>sourceId(id)))].slice(0,8);
    const quotes=await mapLimit(ids,4,async id=>{const {card,result}=await detail(sourceId(id)!);return card?{...card,stale:card.priceState==='stale'}:{id,priceState:result.error==='RATE_LIMITED'?'rate_limited':'upstream',stale:true,markets:[]};});
    return {status:200,body:{...base,ok:true,quotes}};
  }
  const sportIds=params.get('includeSports')==='1'?Object.values(V5_SPORT_IDS):[10];
  const listings=await mapLimit(sportIds,1,async sportId=>{
    const [live,today]=await Promise.all([cached(`live:${sportId}`,45_000,()=>reader.live(sportId)),cached(`today:${sportId}`,180_000,()=>reader.today(sportId))]);
    const now=Date.now();const all=[...rows(live.data),...rows(today.data)];const unique=new Map<string,JsonRecord>();
    for(const f of all)if(record(f.sport).sportId===sportId&&name(f.fixtureId)&&!unique.has(name(f.fixtureId))&&(record(f.status).live===true||Number(f.startTime)*1000>now))unique.set(name(f.fixtureId),f);
    const fixtures=[...unique.values()].sort((a,b)=>Number(record(b.status).live===true)-Number(record(a.status).live===true)||Number(a.startTime)-Number(b.startTime));
    const selected=[...fixtures.filter(f=>record(f.status).live===true).slice(0,16),...fixtures.filter(f=>record(f.status).live!==true).slice(0,24)];
    const limited=(!live.ok&&live.error==='RATE_LIMITED')||(!today.ok&&today.error==='RATE_LIMITED')||live.snapshotStale||today.snapshotStale;
    return {sportId,fixtures:selected,ok:live.ok||today.ok,error:live.ok||today.ok?null:live.error||today.error,stale:live.snapshotStale||today.snapshotStale,rateLimited:limited};
  });
  const raw=listings.flatMap(s=>s.fixtures);
  const targets=listings.flatMap(s=>[s.fixtures.find(f=>record(f.status).live===true&&record(record(f.bookmakers)['1xbet']).suspended===false),s.fixtures.find(f=>record(f.status).live!==true&&record(record(f.bookmakers)['1xbet']).suspended===false)].filter((f):f is JsonRecord=>Boolean(f)));
  const priced=await mapLimit(targets,1,async f=>(await detail(name(f.fixtureId))).card);
  const byId=new Map(priced.filter((c):c is Card=>Boolean(c)).map(c=>[c.id,c]));
  const events=raw.map(f=>byId.get(V5_EVENT_PREFIX+name(f.fixtureId))||v5FixtureToCard(f,null)).filter((c):c is Card=>Boolean(c)).sort((a,b)=>Number(b.markets.length>0)-Number(a.markets.length>0)||a.tier-b.tier||Number(b.live)-Number(a.live));
  const anyOk=listings.some(s=>s.ok);
  return {status:anyOk?200:503,body:{...base,ok:anyOk,error:anyOk?null:listings[0]?.error??null,rateLimited:listings.some(s=>s.rateLimited),stale:listings.some(s=>s.stale),providerLimits:V5_DOCUMENTED_LIMITS,requestGapMs:V5_REQUEST_GAPS,events,featuredLive:events.filter(c=>c.live).slice(0,16),featuredLine:events.filter(c=>!c.live).slice(0,24),schedule:events.filter(c=>!c.live),coverage:listings.map(({sportId,ok,error,fixtures,stale,rateLimited})=>({sportId,ok,error,stale,rateLimited,count:fixtures.length}))}};
}
