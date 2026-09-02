import type { LsportsFlow } from '../config.js';
import { classifySdkMessage } from './classify.js';
import {
  emptyKeepAliveDiagnostics,
  extractKeepAliveActiveEvents,
  keepAliveDiagnosticsFromIds,
  type LsportsKeepAliveDiagnostics,
} from './keepalive.js';

export interface LsportsSdkCounters {
  messages: number;
  heartbeatType32: number;
  keepAliveType31: number;
  type1: number;
  type2: number;
  type3: number;
  type35: number;
  unknown: number;
  typeNull: number;
  parseFailures: number;
  schemaFailures: number;
  reconnects: number;
}

export interface LsportsSdkShadowSnapshot {
  flow: LsportsFlow;
  connection: 'in-process-shadow' | 'sdk-feed' | 'idle';
  lastMessageAt: number | null;
  counters: LsportsSdkCounters;
  keepAlive: LsportsKeepAliveDiagnostics;
}

function emptyCounters(): LsportsSdkCounters {
  return {
    messages: 0,
    heartbeatType32: 0,
    keepAliveType31: 0,
    type1: 0,
    type2: 0,
    type3: 0,
    type35: 0,
    unknown: 0,
    typeNull: 0,
    parseFailures: 0,
    schemaFailures: 0,
    reconnects: 0,
  };
}

export class LsportsSdkShadowCollector {
  private connection: LsportsSdkShadowSnapshot['connection'] = 'idle';
  private lastMessageAt: number | null = null;
  private readonly counters: LsportsSdkCounters = emptyCounters();
  private keepAlive = emptyKeepAliveDiagnostics();

  constructor(readonly flow: LsportsFlow) {}

  markConnection(connection: LsportsSdkShadowSnapshot['connection']): void {
    this.connection = connection;
  }

  noteReconnect(): void {
    this.counters.reconnects += 1;
  }

  noteParseFailure(now = Date.now()): void {
    this.counters.messages += 1;
    this.counters.parseFailures += 1;
    this.lastMessageAt = now;
  }

  observe(payload: unknown, now = Date.now()): void {
    this.counters.messages += 1;
    this.lastMessageAt = now;
    if (this.connection === 'idle') this.connection = 'in-process-shadow';
    const classified = classifySdkMessage(payload);
    if (classified.schemaFailure) this.counters.schemaFailures += 1;
    switch (classified.kind) {
      case 'type1':
        this.counters.type1 += 1;
        break;
      case 'type2':
        this.counters.type2 += 1;
        break;
      case 'type3':
        this.counters.type3 += 1;
        break;
      case 'type31': {
        this.counters.keepAliveType31 += 1;
        const extracted = extractKeepAliveActiveEvents(payload);
        this.keepAlive = keepAliveDiagnosticsFromIds(extracted.fixtureIds, now);
        break;
      }
      case 'type32':
        this.counters.heartbeatType32 += 1;
        break;
      case 'type35':
        this.counters.type35 += 1;
        break;
      case 'null':
        this.counters.typeNull += 1;
        break;
      default:
        this.counters.unknown += 1;
        break;
    }
  }

  snapshot(): LsportsSdkShadowSnapshot {
    return {
      flow: this.flow,
      connection: this.connection,
      lastMessageAt: this.lastMessageAt,
      counters: { ...this.counters },
      keepAlive: { ...this.keepAlive, sampleFixtureIds: [...this.keepAlive.sampleFixtureIds] },
    };
  }
}

const collectors: Record<LsportsFlow, LsportsSdkShadowCollector> = {
  inplay: new LsportsSdkShadowCollector('inplay'),
  prematch: new LsportsSdkShadowCollector('prematch'),
};

export function sdkShadowFor(flow: LsportsFlow): LsportsSdkShadowCollector {
  return collectors[flow];
}

export function resetSdkShadowsForTests(): void {
  collectors.inplay = new LsportsSdkShadowCollector('inplay');
  collectors.prematch = new LsportsSdkShadowCollector('prematch');
}
