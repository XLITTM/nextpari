import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, X } from 'lucide-react';
import {
  fetchSiteMessages,
  markMessageRead,
  readSiteMessages,
  filterMessagesForPlayer,
  type SiteMessage,
} from '../lib/siteMessages';

interface InboxModalProps {
  open: boolean;
  playerId: string;
  onClose: () => void;
}

export function InboxModal({ open: isOpen, playerId, onClose }: InboxModalProps) {
  const [messages, setMessages] = useState<SiteMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(false);

  const applyLocalFallback = useCallback(() => {
    const local = filterMessagesForPlayer(readSiteMessages(), playerId);
    setMessages(local);
  }, [playerId]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Supabase first
      const remoteOrLocal = await fetchSiteMessages(playerId);
      if (remoteOrLocal.length > 0) {
        setMessages(remoteOrLocal);
        return;
      }
      // 2) Explicit local fallback
      const stored = JSON.parse(localStorage.getItem('site_messages') || '[]');
      if (Array.isArray(stored) && stored.length > 0) {
        setMessages(filterMessagesForPlayer(
          stored.map((row: Record<string, unknown>) => ({
            id: (row.id as string | number) ?? Date.now(),
            recipientId: String(row.recipientId ?? row.recipient_id ?? ''),
            title: String(row.title ?? ''),
            content: String(row.content ?? ''),
            date: String(row.date ?? row.created_at ?? new Date().toLocaleString()),
            isRead: Boolean(row.isRead ?? row.is_read),
          })).filter((row: SiteMessage) => Boolean(row.title)),
          playerId,
        ));
        return;
      }
      setMessages([]);
    } catch (e) {
      console.error(e);
      applyLocalFallback();
    } finally {
      setLoading(false);
    }
  }, [playerId, applyLocalFallback]);

  useEffect(() => {
    if (!isOpen) return;

    void loadMessages();

    const onSync = () => {
      void loadMessages();
    };
    window.addEventListener('storage', onSync);
    window.addEventListener('messages_updated', onSync);
    return () => {
      window.removeEventListener('storage', onSync);
      window.removeEventListener('messages_updated', onSync);
    };
  }, [isOpen, loadMessages]);

  useEffect(() => {
    if (!isOpen) setSelectedId(null);
  }, [isOpen]);

  const selected = useMemo(
    () => messages.find((row) => String(row.id) === String(selectedId)) ?? null,
    [messages, selectedId],
  );

  if (!isOpen) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-end bg-black/50 sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-[#1e293b] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-brand-600" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Входящие</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && !hasMessages ? (
            <p className="py-12 text-center text-sm font-medium text-gray-500 dark:text-gray-300">
              Загрузка…
            </p>
          ) : hasMessages ? (
            <ul className="space-y-2">
              {messages.map((row) => {
                const active = String(selectedId) === String(row.id);
                return (
                  <li key={String(row.id)}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(row.id);
                        if (!row.isRead) {
                          void markMessageRead(row.id).then(() => {
                            setMessages((prev) =>
                              prev.map((item) =>
                                String(item.id) === String(row.id)
                                  ? { ...item, isRead: true }
                                  : item,
                              ),
                            );
                          });
                        }
                      }}
                      className={`w-full rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                        !row.isRead
                          ? 'border-emerald-200 bg-emerald-500/10 dark:border-emerald-800'
                          : active
                            ? 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-600/10'
                            : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-[#0f172a]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          {row.title || 'Без темы'}
                        </p>
                        {!row.isRead && (
                          <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        {row.date}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">
                        {row.content || '—'}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-12 text-center text-sm font-medium text-gray-500 dark:text-gray-300">
              Сообщений пока нет
            </p>
          )}
        </div>

        {selected && (
          <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-900 dark:text-white">{selected.title}</p>
            <p className="mt-0.5 text-[11px] text-gray-500">{selected.date}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{selected.content}</p>
          </div>
        )}
      </div>
    </div>
  );
}
