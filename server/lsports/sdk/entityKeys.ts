/**
 * Official TRADE NodeJS SDK @EntityKey values from trade360-nodejs-sdk 3.10.9.
 * Source: dist/src/entities/message-types/*-update.js (not guessed).
 */
export const SDK_ENTITY_KEY = {
  FixtureMetadataUpdate: 1,
  LivescoreUpdate: 2,
  MarketUpdate: 3,
  KeepAliveUpdate: 31,
  HeartbeatUpdate: 32,
  SettlementUpdate: 35,
} as const;

export const SDK_KNOWN_ENTITY_KEYS = new Set<number>(Object.values(SDK_ENTITY_KEY));

export type SdkEntityName = keyof typeof SDK_ENTITY_KEY;

export function sdkEntityNameForType(type: number | null): SdkEntityName | 'unknown' | 'null' {
  if (type == null) return 'null';
  if (type === SDK_ENTITY_KEY.FixtureMetadataUpdate) return 'FixtureMetadataUpdate';
  if (type === SDK_ENTITY_KEY.LivescoreUpdate) return 'LivescoreUpdate';
  if (type === SDK_ENTITY_KEY.MarketUpdate) return 'MarketUpdate';
  if (type === SDK_ENTITY_KEY.KeepAliveUpdate) return 'KeepAliveUpdate';
  if (type === SDK_ENTITY_KEY.HeartbeatUpdate) return 'HeartbeatUpdate';
  if (type === SDK_ENTITY_KEY.SettlementUpdate) return 'SettlementUpdate';
  return 'unknown';
}
