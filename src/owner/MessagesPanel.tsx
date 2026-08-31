import { useState } from 'react';
import { Mail } from 'lucide-react';
import { sendOwnerMessage } from './services';

export function MessagesPanel() {
  const [recipientId, setRecipientId] = useState('');
  const [sendToAll, setSendToAll] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    setError('');
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    const trimmedId = recipientId.replace(/\D/g, '');

    if (!sendToAll && !trimmedId) {
      setError('Укажите ID игрока или отметьте «Отправить всем»');
      return;
    }
    if (!trimmedContent) {
      setError('Введите текст сообщения');
      return;
    }

    setSending(true);
    try {
      await sendOwnerMessage({
        targetType: sendToAll ? 'all' : 'player',
        targetPlayerId: sendToAll ? null : trimmedId,
        title: trimmedTitle,
        body: trimmedContent,
      });
      setTitle('');
      setContent('');
      if (!sendToAll) setRecipientId('');
      setToast('Сообщение отправлено');
      window.setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <h2 className="text-2xl font-extrabold text-ink-900 mb-5">Сообщения игрокам</h2>
      <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-ink-900">Отправить сообщение</h3>
            <p className="text-xs text-gray-500">JWT owner_send_message · игрок или всем</p>
          </div>
        </div>
        {error && (
          <p className="mb-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        {toast && (
          <p className="mb-3 text-xs font-semibold text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
            {toast}
          </p>
        )}
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">ID игрока</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-3">
          <input
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Например, 729767"
            disabled={sendToAll || sending}
            className="flex-1 bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none disabled:opacity-50"
          />
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 shrink-0">
            <input
              type="checkbox"
              checked={sendToAll}
              onChange={(e) => setSendToAll(e.target.checked)}
              disabled={sending}
              className="h-4 w-4 rounded border-gray-300 text-brand-600"
            />
            Отправить всем
          </label>
        </div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Тема</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Тема"
          disabled={sending}
          className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none mb-3 disabled:opacity-50"
        />
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Текст</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Сообщение"
          disabled={sending}
          rows={5}
          className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none mb-4 disabled:opacity-50 resize-y"
        />
        <button
          type="button"
          disabled={sending}
          onClick={() => void handleSubmit()}
          className="w-full bg-ink-900 text-white font-bold py-3 rounded-xl disabled:opacity-50"
        >
          {sending ? 'Отправка…' : 'Отправить'}
        </button>
      </div>
    </section>
  );
}
