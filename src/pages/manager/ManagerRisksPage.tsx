import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchManagerRiskBets } from '../../manager/services';

export function ManagerRisksPage() {
  const [available, setAvailable] = useState(false);
  const [reason, setReason] = useState('NETWORK_SCOPE_PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchManagerRiskBets();
      setAvailable(page.available);
      setReason(page.reason || 'NETWORK_SCOPE_PENDING');
    } catch (err) {
      setAvailable(false);
      setReason('NETWORK_SCOPE_PENDING');
      setError(err instanceof Error ? err.message : 'Не удалось загрузить риски');
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
          <h2 className="text-2xl font-extrabold text-ink-900">Риски</h2>
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
      <div className="bg-white rounded-2xl border border-amber-100 px-6 py-12 text-center" data-available={available ? 'true' : 'false'}>
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
        <p className="text-sm font-semibold text-ink-900">
          {loading
            ? 'Загрузка…'
            : 'Risk data temporarily unavailable while network scoping is being migrated.'}
        </p>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          Нескопленный RPC отключён. Пустой список не означает отсутствие рисков.
          {reason ? ` Код: ${reason}.` : ''}
        </p>
      </div>
    </section>
  );
}
