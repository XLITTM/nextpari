import { useEffect, useState } from 'react';
import { PERMISSION_LABEL, ROLE_LABEL, ROLE_CEILING, type OfficeRoute } from '../access/model';
import { readPage } from '../api/operations';
import type { FailureReason } from '../api/http';
import type { PageData } from '../api/parsers';
import { BRAND } from '../brand';
import { OfficeForm } from './OfficeForm';
import { StatusBanner } from './Status';

export function PortalPage({ route }: { route: OfficeRoute }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [failure, setFailure] = useState<FailureReason>('disconnected');
  const [data, setData] = useState<PageData | null>(null);

  useEffect(() => {
    let live = true;
    setPhase('loading');
    setData(null);
    void readPage(route).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setFailure(result.reason);
        setPhase('failed');
        return;
      }
      setData(result.data);
      setPhase('ready');
    });
    return () => {
      live = false;
    };
  }, [route]);

  useEffect(() => {
    document.title = `${route.title} · RIXO BET Office`;
  }, [route.title]);

  return (
    <section className="rx-page">
      <header className="rx-page-head">
        <p>
          {ROLE_LABEL[route.role]} · {BRAND.name} · {BRAND.code}
        </p>
        <h1>{route.title}</h1>
        <p>{route.intro}</p>
      </header>
      {phase === 'loading' ? <p className="rx-wait">Запрос к серверу…</p> : null}
      {phase === 'failed' ? <StatusBanner reason={failure} /> : null}
      {phase !== 'ready' && route.slots.length > 0 ? (
        <div className="rx-metrics">
          {route.slots.map((slot) => (
            <article key={slot}>
              <span>{slot}</span>
              <strong data-metric="empty">—</strong>
              <small>Не подключено</small>
            </article>
          ))}
        </div>
      ) : null}
      {data?.kind === 'metrics' ? (
        <div className="rx-metrics">
          {data.metrics.length === 0 ? <p className="rx-empty">Сервер вернул пустой список.</p> : null}
          {data.metrics.map((metric) => (
            <article key={metric.key}>
              <span>{metric.label}</span>
              <strong data-metric="server">{metric.value}</strong>
              <small>Срез сервера</small>
            </article>
          ))}
        </div>
      ) : null}
      {data?.kind === 'accounts' ? (
        <div className="rx-table-wrap">
          {data.accounts.length === 0 ? <p className="rx-empty">Сервер вернул пустой список.</p> : null}
          {data.accounts.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Счёт</th>
                  <th>Валюта</th>
                  <th>Сумма сервера</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.label}</td>
                    <td>{account.currency}</td>
                    <td>{account.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
      {phase !== 'ready' && route.data === 'records' ? (
        <div className="rx-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Идентификатор</th>
                <th>Описание</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3}>Не подключено</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {data?.kind === 'records' ? (
        <div className="rx-table-wrap">
          {data.records.length === 0 ? <p className="rx-empty">Сервер вернул пустой список.</p> : (
            <table>
              <thead>
                <tr>
                  <th>Идентификатор</th>
                  <th>Описание</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record) => (
                  <tr key={record.id}>
                    <td>{record.id}</td>
                    <td>
                      <strong>{record.title}</strong>
                      <small>{record.detail}</small>
                    </td>
                    <td>{record.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      {route.id === 'owner.settings' ? (
        <div className="rx-matrix">
          <h2>Потолок прав</h2>
          <p>Это граница клиента. Учётные записи и выданные права здесь не хранятся.</p>
          {(Object.keys(ROLE_CEILING) as Array<keyof typeof ROLE_CEILING>).map((role) => (
            <section key={role}>
              <h3>{ROLE_LABEL[role]}</h3>
              <ul>
                {ROLE_CEILING[role].map((permission) => (
                  <li key={permission}>{PERMISSION_LABEL[permission]}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {route.form ? <OfficeForm key={route.form.id} form={route.form} /> : null}
    </section>
  );
}
