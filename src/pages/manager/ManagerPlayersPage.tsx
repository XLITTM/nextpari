import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { fetchManagerPlayers } from '../../manager/services';

export function ManagerPlayersPage() {
  const [available, setAvailable] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchManagerPlayers();
      setAvailable(page.available);
      setTotal(page.total);
    } catch (err) {
      setAvailable(false);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить игроков');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Игроки</h2>
          <p className="text-sm text-gray-500 mt-0.5">Только сеть текущего менеджера</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 px-6 py-12 text-center">
        <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-ink-900">
          {loading ? 'Загрузка…' : available ? `${total} игроков` : 'Список игроков сети пока недоступен'}
        </p>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          Нет канонического manager-scoped RPC для игроков. Прямое чтение таблиц отключено, чтобы не показывать чужие сети и демо-профили.
        </p>
      </div>
    </section>
  );
}
