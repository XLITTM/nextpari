export const SITE_MESSAGES_KEY = 'site_messages';
export const SITE_MESSAGES_EVENT = 'messages_updated';

export interface SiteMessage {
  id: string | number;
  recipientId: string;
  title: string;
  content: string;
  date: string;
  isRead: boolean;
}

function notifyMessagesUpdated() {
  window.dispatchEvent(new Event('messages_updated'));
  try {
    const channel = new BroadcastChannel('messages_updated');
    channel.postMessage('refresh');
    channel.close();
  } catch {
    /* ignore */
  }
}

function formatDate(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toLocaleString();
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleString();
  }
  return new Date().toLocaleString();
}

function asMessage(value: unknown): SiteMessage | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const title = String(row.title ?? '').trim();
  if (!title) return null;

  const rawId = row.id;
  const id =
    typeof rawId === 'string' || typeof rawId === 'number'
      ? rawId
      : Date.now();

  const recipientId = String(
    row.recipientId ?? row.recipient_id ?? '',
  ).trim();

  return {
    id,
    recipientId,
    title,
    content: String(row.content ?? '').trim(),
    date: formatDate(row.date ?? row.created_at),
    isRead: Boolean(row.isRead ?? row.is_read),
  };
}

/** Soft visibility: all / empty / match (case & digits tolerant). Never hide the whole inbox if rows exist. */
export function filterMessagesForPlayer(
  messages: SiteMessage[],
  playerId: string,
): SiteMessage[] {
  if (!messages.length) return [];

  const currentId = String(playerId || '').trim().toLowerCase();
  const digits = currentId.replace(/\D/g, '');

  const matched = messages.filter((msg) => {
    const recId = String(msg.recipientId || '').trim().toLowerCase();
    if (!recId || recId === 'all') return true;
    if (recId === currentId) return true;
    const recDigits = recId.replace(/\D/g, '');
    if (digits && recDigits && recDigits === digits) return true;
    return false;
  });

  // If ID quirks wiped the list but storage has rows — show everything
  return matched.length > 0 ? matched : messages;
}

export function readSiteMessages(): SiteMessage[] {
  try {
    const raw = localStorage.getItem('site_messages');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(asMessage)
      .filter((row): row is SiteMessage => Boolean(row))
      .sort((a, b) => {
        const ta = typeof a.id === 'number' ? a.id : Date.parse(a.date) || 0;
        const tb = typeof b.id === 'number' ? b.id : Date.parse(b.date) || 0;
        return tb - ta;
      });
  } catch {
    return [];
  }
}

export function writeSiteMessages(messages: SiteMessage[]) {
  localStorage.setItem('site_messages', JSON.stringify(messages.slice(0, 200)));
  notifyMessagesUpdated();
}

export function listMessagesForPlayer(playerId: string): SiteMessage[] {
  return filterMessagesForPlayer(readSiteMessages(), playerId);
}

export function countUnreadForPlayer(playerId: string): number {
  return listMessagesForPlayer(playerId).filter((row) => !row.isRead).length;
}

function persistLocalMessage(message: SiteMessage) {
  const current = readSiteMessages();
  const next = [message, ...current.filter((row) => String(row.id) !== String(message.id))];
  localStorage.setItem('site_messages', JSON.stringify(next.slice(0, 200)));
  notifyMessagesUpdated();
}

export async function fetchSiteMessages(playerId: string): Promise<SiteMessage[]> {
  return filterMessagesForPlayer(readSiteMessages(), playerId);
}

export async function sendSiteMessage(params: {
  recipientId: string;
  title: string;
  content: string;
}): Promise<SiteMessage> {
  const recipientId = params.recipientId.trim() || 'all';
  const title = params.title.trim();
  const content = params.content.trim();
  const createdAt = new Date();

  const newMessage: SiteMessage = {
    id: Date.now(),
    recipientId,
    title,
    content,
    date: createdAt.toLocaleString(),
    isRead: false,
  };

  // Always mirror to localStorage (shared fallback)
  const currentMessages = JSON.parse(localStorage.getItem('site_messages') || '[]');
  if (Array.isArray(currentMessages)) {
    currentMessages.unshift(newMessage);
    localStorage.setItem('site_messages', JSON.stringify(currentMessages.slice(0, 200)));
  } else {
    localStorage.setItem('site_messages', JSON.stringify([newMessage]));
  }
  notifyMessagesUpdated();
  return newMessage;
}

export async function markMessageRead(messageId: string | number): Promise<SiteMessage[]> {
  const next = readSiteMessages().map((row) =>
    String(row.id) === String(messageId) ? { ...row, isRead: true } : row,
  );
  localStorage.setItem('site_messages', JSON.stringify(next.slice(0, 200)));
  notifyMessagesUpdated();
  return next;
}

export function subscribeSiteMessages(onChange: () => void): () => void {
  window.addEventListener('messages_updated', onChange);
  window.addEventListener('storage', onChange);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel('messages_updated');
    channel.onmessage = () => onChange();
  } catch {
    /* ignore */
  }
  return () => {
    window.removeEventListener('messages_updated', onChange);
    window.removeEventListener('storage', onChange);
    try {
      channel?.close();
    } catch {
      /* ignore */
    }
  };
}
