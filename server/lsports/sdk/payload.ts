import { SDK_ENTITY_KEY } from './entityKeys.js';

export interface SdkHeaderLike {
  type?: number;
  msgSeq?: number;
  msgGuid?: string;
  serverTimestamp?: number;
}

export interface SdkKeepAliveLike {
  activeEvents?: unknown[];
  ActiveEvents?: unknown[];
}

export interface SdkEntityLike {
  events?: unknown[];
  keepAlive?: SdkKeepAliveLike;
  feedInterrupted?: unknown;
}

/**
 * Rebuild the Header/Body JSON our canonical store already understands
 * from official SDK IMessageStructure fields.
 */
export function reconstructPayloadFromSdk(
  header: SdkHeaderLike | undefined,
  entity: SdkEntityLike | undefined,
): unknown {
  const type = header?.type ?? null;
  const body = bodyFromSdkEntity(type, entity);
  return {
    Header: {
      Type: type,
      MsgSeq: header?.msgSeq ?? null,
      MsgGuid: header?.msgGuid ?? null,
      ServerTimestamp: header?.serverTimestamp ?? null,
    },
    Body: body,
  };
}

function bodyFromSdkEntity(type: number | null, entity: SdkEntityLike | undefined): unknown {
  if (type === SDK_ENTITY_KEY.KeepAliveUpdate) {
    const keepAlive = entity?.keepAlive;
    return {
      KeepAlive: {
        ActiveEvents: keepAlive?.activeEvents ?? keepAlive?.ActiveEvents ?? [],
      },
    };
  }
  if (type === SDK_ENTITY_KEY.HeartbeatUpdate) {
    return entity?.feedInterrupted != null ? { FeedInterrupted: entity.feedInterrupted } : {};
  }
  return { Events: entity?.events ?? [] };
}
