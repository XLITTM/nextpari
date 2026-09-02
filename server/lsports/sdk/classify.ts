import { readHeader } from '../state/parse.js';
import { SDK_ENTITY_KEY, SDK_KNOWN_ENTITY_KEYS, sdkEntityNameForType } from './entityKeys.js';
import { extractKeepAliveActiveEvents } from './keepalive.js';

export type SdkMessageKind =
  | 'type1'
  | 'type2'
  | 'type3'
  | 'type31'
  | 'type32'
  | 'type35'
  | 'unknown'
  | 'null';

export interface SdkClassification {
  type: number | null;
  kind: SdkMessageKind;
  entityName: ReturnType<typeof sdkEntityNameForType>;
  schemaFailure: boolean;
}

export function classifySdkMessage(payload: unknown): SdkClassification {
  const type = readHeader(payload).type;
  let kind: SdkMessageKind = 'unknown';
  if (type == null) kind = 'null';
  else if (type === SDK_ENTITY_KEY.FixtureMetadataUpdate) kind = 'type1';
  else if (type === SDK_ENTITY_KEY.LivescoreUpdate) kind = 'type2';
  else if (type === SDK_ENTITY_KEY.MarketUpdate) kind = 'type3';
  else if (type === SDK_ENTITY_KEY.KeepAliveUpdate) kind = 'type31';
  else if (type === SDK_ENTITY_KEY.HeartbeatUpdate) kind = 'type32';
  else if (type === SDK_ENTITY_KEY.SettlementUpdate) kind = 'type35';

  let schemaFailure = false;
  if (type != null && !SDK_KNOWN_ENTITY_KEYS.has(type)) schemaFailure = true;
  if (kind === 'type31') {
    const extracted = extractKeepAliveActiveEvents(payload);
    if (!extracted.hasKeepAliveObject) schemaFailure = true;
  }
  return {
    type,
    kind,
    entityName: sdkEntityNameForType(type),
    schemaFailure,
  };
}
