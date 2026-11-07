import { readOfficeConfig } from './env';
import { handleOffice, officeFor, type OfficeRequest, type OfficeResponse } from './handler';
import { openPostgresOffice } from './postgres';
import type { OfficeRepository } from './repository';

export type OfficeHandler = (request: OfficeRequest) => Promise<OfficeResponse>;

export function createProductionHandler(env: Readonly<Record<string, string | undefined>> = process.env): OfficeHandler {
  const config = readOfficeConfig(env);
  if (!config.ok) return (request) => handleOffice(request, null);
  let opening: Promise<OfficeRepository | null> | null = null;
  return async (request) => {
    opening ??= openPostgresOffice(config.config).catch(() => null);
    const repository = await opening;
    if (!repository) return handleOffice(request, null);
    return handleOffice(request, officeFor(repository, config.config.sessionPepper));
  };
}
