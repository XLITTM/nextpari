import { useEffect, useState } from 'react';
import { publicProviderCatalog } from '../../server/providerOffice/terms.ts';

export function ProvidersPanel() {
  const catalog = publicProviderCatalog();
  const oddspapi = catalog.contracts[0];
  const [sportsGgr, setSportsGgr] = useState<string | null>(null);
  const [sportsError, setSportsError] = useState('Источник спортивных расчётов подключается отдельно. Пока он недоступен, суммы не подставляются.');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/group-owner/sportsbook-ggr', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json() as { error?: string; report?: { reporting?: { ggr?: string | null } } };
        if (cancelled) return;
        const ggr = body.report?.reporting?.ggr;
        if (!response.ok || !body.report || ggr == null) {
          setSportsGgr(null);
          setSportsError(String(body.error ?? 'REPORTING_SOURCE_UNAVAILABLE'));
          return;
        }
        setSportsError('');
        setSportsGgr(ggr);
      })
      .catch(() => {
        if (!cancelled) {
          setSportsGgr(null);
          setSportsError('REPORTING_SOURCE_UNAVAILABLE');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <h2>Провайдеры</h2>
      <p className="note">Договоры, бренды и доступ читаются из кабинета провайдера. Этот экран не пишет в базу и не создаёт учётные записи.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Провайдер</th>
              <th>Юрлицо</th>
              <th>Продукт</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {catalog.providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.key}</td>
                <td>{provider.legalEntity}</td>
                <td>{provider.product}</td>
                <td>{provider.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Договор OddsPapi</h2>
      <p className="note">
        Начало {oddspapi?.commencementDate}. Месячная плата USD {oddspapi?.monthlyFee}. Доля {oddspapi?.revenueShareBps} б.п.
        Период с {oddspapi?.periodStartDay} по {oddspapi?.periodEndDay}. Платёжный день {oddspapi?.paymentDay}.
        Покрытые бренды: {(oddspapi?.coveredBrandCodes ?? []).join(', ') || 'нет'}.
      </p>
      <h2>Назначения</h2>
      <p className="note">RYXO BET не входит в договор OddsPapi. Назначение другого бренда этим экраном не выполняется.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Бренд</th><th>Доступ</th><th>Область</th><th>Статус</th></tr>
          </thead>
          <tbody>
            {catalog.assignments.map((assignment) => (
              <tr key={`${assignment.providerId}-${assignment.brandCode}`}>
                <td>{assignment.brandCode}</td>
                <td>{assignment.access}</td>
                <td>{assignment.scopes.join(', ')}</td>
                <td>{assignment.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Спортсбук GGR</h2>
      {sportsGgr == null ? <p className="warning" role="status">{sportsError}</p> : <p>NextPari USD {sportsGgr}</p>}
      <h2>Казино GGR</h2>
      <p className="note">Казино не входит в договор OddsPapi. Источник казино не подключён.</p>
      <h2>Биллинг и доступ</h2>
      <p className="note">Формула доплаты читается из версии договора. Учётные записи провайдера не выпущены.</p>
      <div className="actions">
        <button className="primary" type="button" disabled>Активировать</button>
        <button type="button" disabled>Деактивировать</button>
        <button type="button" disabled>Назначить договор</button>
        <span>Кнопки не пишут в базу.</span>
      </div>
    </section>
  );
}
