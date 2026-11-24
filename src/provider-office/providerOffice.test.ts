import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSportsbookReport } from '../../server/providerOffice/report.ts';
import { SEED_DIRECTORY } from '../../server/providerOffice/terms.ts';
import { ProviderOfficeApp, type OfficeReportView } from './ProviderOfficeApp.tsx';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('provider office interface', () => {
  it('uses English by default, offers Russian, and shows the read-only mark', () => {
    const english = renderToStaticMarkup(createElement(ProviderOfficeApp, {
      initialSession: { legalEntity: '55 Tech Limited', access: 'read' },
      initialReport: { ok: false, error: 'REPORTING_SOURCE_UNAVAILABLE' },
    }));
    assert.match(english, /Provider Office/);
    assert.match(english, /Read only/);
    assert.match(english, /reporting source is unavailable/);
    assert.doesNotMatch(english, /0\.00/);
    const russian = renderToStaticMarkup(createElement(ProviderOfficeApp, {
      initialLanguage: 'ru',
      initialSession: { legalEntity: '55 Tech Limited', access: 'read' },
      initialReport: { ok: false, error: 'REPORTING_SOURCE_UNAVAILABLE' },
    }));
    assert.match(russian, /Кабинет провайдера/);
    assert.match(russian, /Только чтение/);
    assert.match(russian, /Источник отчёта недоступен/);
  });

  it('renders a report that came from the contractual engine', () => {
    const built = buildSportsbookReport({
      actor: { kind: 'provider', providerId: '10000000-0000-4000-8000-0000000000a1' },
      directory: SEED_DIRECTORY,
      brandCode: '001',
      asOf: '2026-11-24',
      facts: [{
        betId: 'bet-1',
        brandCode: '001',
        product: 'sports',
        currency: 'USD',
        stake: '50000.00',
        payout: '0.00',
        settlement: 'loser',
        status: 'settled',
        mode: 'single',
        settledAt: '2026-11-24T12:00:00.000Z',
        testAccount: false,
        sports: ['football'],
      }],
      loadedAt: '2026-11-24T18:00:00.000Z',
      rate: null,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const markup = renderToStaticMarkup(createElement(ProviderOfficeApp, {
      initialSession: { legalEntity: built.legalEntity, access: 'read' },
      initialReport: built as OfficeReportView,
    }));
    assert.match(markup, /50000\.00/);
    assert.match(markup, /5000\.00/);
    assert.match(markup, /55 Tech Limited/);
    assert.match(markup, /NextPari/);
    assert.match(markup, /Export CSV/);
  });

  it('stays off the production player entry', () => {
    const index = readFileSync(join(root, 'index.html'), 'utf8');
    const app = readFileSync(join(root, 'src/provider-office/ProviderOfficeApp.tsx'), 'utf8');
    assert.match(index, /src\/main\.tsx/);
    assert.doesNotMatch(index, /provider-office/);
    assert.doesNotMatch(app, /service_role|SUPABASE_SERVICE|VITE_/i);
  });
});
