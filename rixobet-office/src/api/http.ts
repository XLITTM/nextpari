import { BRAND } from '../brand';

export const OFFICE_API_PREFIX = '/api/rixobet/office/v1';

export type FailureReason = 'disconnected' | 'denied' | 'invalid';

export class OfficeFailure extends Error {
  readonly reason: FailureReason;
  readonly status: number | null;

  constructor(reason: FailureReason, status: number | null = null) {
    super(reason);
    this.name = 'OfficeFailure';
    this.reason = reason;
    this.status = status;
  }
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  action: string;
  body?: Readonly<Record<string, unknown>>;
  idempotencyKey?: string;
}

function isHtml(response: Response): boolean {
  const type = response.headers.get('content-type') ?? '';
  return type.includes('text/html');
}

export async function officeRequest(path: string, options: RequestOptions): Promise<unknown> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new OfficeFailure('invalid');
  }
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-rixo-brand': BRAND.code,
    'x-rixo-product': BRAND.product,
    'x-rixo-audit-action': options.action,
  };
  if (options.idempotencyKey) headers['x-rixo-idempotency-key'] = options.idempotencyKey;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${OFFICE_API_PREFIX}${path}`, {
      method: options.method,
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new OfficeFailure('disconnected');
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new OfficeFailure('denied', response.status);
  }
  if (
    response.status === 404 ||
    response.status === 408 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  ) {
    throw new OfficeFailure('disconnected', response.status);
  }
  if (isHtml(response)) throw new OfficeFailure('disconnected', response.status);
  if (response.status === 400 || response.status === 422) {
    throw new OfficeFailure('invalid', response.status);
  }
  if (!response.ok) throw new OfficeFailure('disconnected', response.status);

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new OfficeFailure('disconnected', response.status);
  }
}
