import { useState } from 'react';
import { CheckCircle, Mail, Send } from 'lucide-react';
import { sendSiteMessage } from '../../lib/siteMessages';

export function SendPlayerMessageForm() {
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
    if (!trimmedTitle) {
      setError('Укажите тему сообщения');
      return;
    }
    if (!trimmedContent) {
      setError('Введите текст сообщения');
      return;
    }

    setSending(true);
    try {
      await sendSiteMessage({
        recipientId: sendToAll ? 'all' : trimmedId,
        title: trimmedTitle,
        content: trimmedContent,
      });

      setTitle('');
      setContent('');
      if (!sendToAll) setRecipientId('');
      setToast('Сообщение отправлено');
      window.setTimeout(() => setToast(''), 2500);
    } catch (err) {
      console.error(err);
      setError('Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-ink-900">Отправить сообщение игроку</h3>
          <p className="text-xs text-gray-500">Supabase + localStorage · личное или всем</p>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          {error}
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

      <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Тема сообщения</label>
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
        placeholder="Текст сообщения"
        rows={5}
        disabled={sending}
        className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-medium outline-none mb-4 resize-y min-h-[120px] disabled:opacity-50"
      />

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={sending}
        className="inline-flex items-center gap-2 bg-ink-900 text-white font-bold px-5 py-3 rounded-xl hover:bg-ink-800 disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {sending ? 'Отправка…' : 'Отправить'}
      </button>

      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-0 right-0 z-[200] flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30">
            <CheckCircle className="h-5 w-5 shrink-0" />
            {toast}
          </div>
        </div>
      )}
    </section>
  );
}
