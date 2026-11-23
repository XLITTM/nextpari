function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function ownerJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const rec = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || rec.ok === false) {
    throw new Error(String(rec.error ?? 'Ошибка'));
  }
  return rec;
}

export type ExpressSelectionDraft = {
  canonicalEventId: string;
  provider: string;
  feedType: string;
  fixtureId: string;
  marketId: string;
  marketKey: string;
  selectionId: string;
  outcomeId: string;
  line: string;
  oddsSnapshot: number;
  matchLabel: string;
  league: string;
  outcomeName: string;
};

export async function fetchOwnerExpresses(): Promise<unknown[]> {
  const rec = await ownerJson('/api/owner/express');
  return Array.isArray(rec.data) ? rec.data : [];
}

export async function searchOwnerExpressEvents(query: string): Promise<unknown[]> {
  const rec = await ownerJson(`/api/owner/express/events?q=${encodeURIComponent(query)}`);
  return Array.isArray(rec.data) ? rec.data : [];
}

export async function saveOwnerExpress(input: {
  id?: string;
  title: string;
  description: string;
  expiresAt: string | null;
  selections: ExpressSelectionDraft[];
}): Promise<Record<string, unknown>> {
  const rec = await ownerJson(input.id ? `/api/owner/express/${input.id}` : '/api/owner/express', {
    method: input.id ? 'PATCH' : 'POST',
    body: JSON.stringify(input),
  });
  return asRecord(rec.data);
}

export async function publishOwnerExpress(id: string): Promise<void> {
  await ownerJson(`/api/owner/express/${id}/publish`, { method: 'POST', body: '{}' });
}

export async function unpublishOwnerExpress(id: string): Promise<void> {
  await ownerJson(`/api/owner/express/${id}/unpublish`, { method: 'POST', body: '{}' });
}

export async function archiveOwnerExpress(id: string): Promise<void> {
  await ownerJson(`/api/owner/express/${id}/archive`, { method: 'POST', body: '{}' });
}
