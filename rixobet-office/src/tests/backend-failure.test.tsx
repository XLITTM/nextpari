import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_CEILING } from '../access/model';
import { OFFICE_API_PREFIX, OfficeFailure } from '../api/http';
import { confirmMfa, readPage, requestLogin, submitForm } from '../api/operations';
import { parseAcceptance, parsePage } from '../api/parsers';
import { AppRoutes } from '../App';
import { AuthProvider, AuthTestProvider } from '../auth/AuthContext';
import { validateFields } from '../forms/validate';
import { matchRoute } from '../nav/catalog';
import { fixtureSession, htmlResponse, jsonResponse } from './fixtures';

describe('missing backend', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse()),
    );
  });

  it('keeps the office API on the brand-scoped relative contract', () => {
    expect(OFFICE_API_PREFIX).toBe('/api/rixobet/office/v1');
    expect(OFFICE_API_PREFIX.startsWith('/')).toBe(true);
    expect(OFFICE_API_PREFIX.includes('://')).toBe(false);
  });

  it('fails closed on network loss, html, and not-found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    const overview = matchRoute('/owner');
    if (!overview) throw new Error('missing overview');
    const lost = await readPage(overview);
    expect(lost).toEqual({ ok: false, reason: 'disconnected' });

    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse()));
    const html = await readPage(overview);
    expect(html.ok).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404, headers: { 'content-type': 'application/json' } })),
    );
    const missing = await readPage(overview);
    expect(missing).toEqual({ ok: false, reason: 'disconnected' });
  });

  it('does not render figures from another brand or a shapeless payload', () => {
    expect(
      parsePage('metrics', {
        brandCode: '001',
        generatedAt: new Date().toISOString(),
        metrics: [{ key: 'players', label: 'Игроки', value: '9' }],
      }),
    ).toBeNull();
    expect(parsePage('accounts', { brandCode: '002', accounts: [{ amount: '100.00' }] })).toBeNull();
    expect(parseAcceptance({ brandCode: '002', accepted: true, auditId: 'audit-123456', operationId: 'op-123456' }, 'other')).toBeNull();
  });

  it('accepts a password session and rejects a mixed MFA payload', async () => {
    const sessionBody = {
      sessionId: 'fixture-owner-session',
      brandCode: '002',
      role: 'owner',
      permissions: [...ROLE_CEILING.owner],
      mfaSatisfied: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      staffId: 'fixture-owner',
      displayName: 'Fixture owner',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/auth/login')) return jsonResponse(sessionBody);
        return htmlResponse();
      }),
    );
    const login = await requestLogin('person@rixobet.com', 'long-password-1');
    expect(login.ok).toBe(true);
    if (login.ok) expect(login.data.kind).toBe('session');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/auth/login')) {
          return jsonResponse({ ...sessionBody, status: 'mfa_required', challengeId: 'challenge-mixed-0001' });
        }
        return htmlResponse();
      }),
    );
    const mixed = await requestLogin('person@rixobet.com', 'long-password-1');
    expect(mixed.ok).toBe(false);
    const mfa = await confirmMfa('challenge-not-issued', '000000');
    expect(mfa.ok).toBe(false);
  });

  it('shows the login failure and does not open a portal', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return htmlResponse();
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('Не подключено')).toBeTruthy();
    const callsAfterProbe = fetchMock.mock.calls.length;
    const form = screen.getByRole('button', { name: 'Войти' }).closest('form');
    if (!form) throw new Error('missing login form');
    fireEvent.submit(form);
    expect((await screen.findAllByText('Заполните поле')).length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.length).toBe(callsAfterProbe);

    fireEvent.change(screen.getByLabelText('Почта'), { target: { value: 'person@rixobet.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'long-password-1' } });
    fireEvent.submit(form);
    expect(await screen.findByText('Не подключено')).toBeTruthy();
    expect(screen.queryByLabelText('Код MFA')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Обзор' })).toBeNull();
    const loginCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/auth/login'));
    if (!loginCall) throw new Error('login was not requested');
    const body = JSON.parse(String(loginCall[1]?.body)) as { role?: string; brandCode?: string };
    expect(body.brandCode).toBe('002');
    expect(body.role).toBeUndefined();
  });

  it('stays unavailable when office authentication has no database credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ brandCode: '002', status: 'unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })),
    );
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('Не подключено')).toBeTruthy();
    expect(screen.queryByLabelText('Код MFA')).toBeNull();
    expect(screen.queryByText('Сессия сервера')).toBeNull();
  });

  it('keeps a deposit request unconfirmed when the server is missing', async () => {
    const form = matchRoute('/cashier/deposits')?.form;
    if (!form) throw new Error('missing deposit form');
    expect(validateFields(form.fields, { playerId: 'p1', currency: 'UZS', amount: '0', note: 'коротко' }).amount).toBeTruthy();
    const fetchMock = vi.fn(async () => htmlResponse());
    vi.stubGlobal('fetch', fetchMock);
    const invalid = validateFields(form.fields, {
      playerId: 'player-1',
      currency: 'uzs',
      amount: '10.50',
      note: 'Кассовый депозит смены',
    });
    expect(invalid.currency).toBeTruthy();
    const result = await submitForm(form, {
      playerId: 'player-1',
      currency: 'UZS',
      amount: '10.50',
      note: 'Кассовый депозит смены',
    });
    expect(result).toEqual({ ok: false, reason: 'disconnected' });
    const treasury = matchRoute('/owner/treasury')?.form;
    if (!treasury) throw new Error('missing treasury');
    expect(
      validateFields(treasury.fields, {
        sourceAccount: 'CASH',
        destinationAccount: 'CASH',
        currency: 'USD',
        amount: '15',
        reason: 'Перевод между счетами',
      }).destinationAccount,
    ).toBe('Счета должны различаться');

    render(
      <AuthTestProvider session={fixtureSession('cashier')}>
        <MemoryRouter initialEntries={['/cashier/deposits']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Депозиты' })).toBeTruthy();
    expect(screen.getAllByText('Не подключено').length).toBeGreaterThan(0);
    expect(screen.queryByText('Сервер принял операцию')).toBeNull();
    expect(document.querySelector('[data-metric="server"]')).toBeNull();
  });

  it('accepts a mutation only from a matching server acknowledgement', async () => {
    const form = matchRoute('/cashier/withdrawals')?.form;
    if (!form) throw new Error('missing withdrawal');
    let key = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const header = new Headers(init?.headers);
        key = header.get('x-rixo-idempotency-key') ?? '';
        return jsonResponse({
          brandCode: '002',
          accepted: true,
          auditId: 'audit-accepted-1',
          operationId: 'operation-accepted-1',
          idempotencyKey: key,
        });
      }),
    );
    const result = await submitForm(form, {
      playerId: 'player-1',
      currency: 'USD',
      amount: '20.00',
      note: 'Запрос на выплату игроку',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.auditId).toBe('audit-accepted-1');
      expect(result.data.idempotencyKey).toBe(key);
    }
    expect(new OfficeFailure('disconnected').reason).toBe('disconnected');
  });

  it('keeps owner activation unavailable when the office API is disconnected', async () => {
    const token = 'invitation-token-example-1';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ brandCode: '002', status: 'unavailable' }, 503)),
    );
    function SearchProbe() {
      const location = useLocation();
      return <output data-testid="search">{location.search}</output>;
    }
    render(
      <MemoryRouter initialEntries={[`/activate?token=${token}`]}>
        <AuthProvider>
          <SearchProbe />
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Активация владельца' })).toBeTruthy();
    expect(await screen.findByText('Не подключено')).toBeTruthy();
    expect(screen.getByLabelText('Приглашение')).toHaveProperty('value', token);
    expect(screen.getByTestId('search').textContent).toBe('');
    expect(screen.queryByText('Учётная запись активирована. Войдите с паролем.')).toBeNull();
    expect(screen.queryByText(/otpauth:\/\//)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(await screen.findAllByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Учётная запись активирована. Войдите с паролем.')).toBeNull();
  });
});
