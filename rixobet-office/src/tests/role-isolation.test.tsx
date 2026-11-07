import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_CEILING, type OfficeRole } from '../access/model';
import { accessDecision } from '../access/guard';
import { parseSession } from '../access/session';
import { submitForm } from '../api/operations';
import { AppRoutes } from '../App';
import { AuthTestProvider } from '../auth/AuthContext';
import { matchRoute } from '../nav/catalog';
import { validateFields } from '../forms/validate';
import { fixtureSession, htmlResponse } from './fixtures';

const denied: Array<[OfficeRole, string]> = [
  ['cashier', '/owner'],
  ['cashier', '/owner/treasury'],
  ['cashier', '/owner/settings'],
  ['cashier', '/owner/payments'],
  ['cashier', '/manager'],
  ['cashier', '/security'],
  ['manager', '/owner/treasury'],
  ['manager', '/owner/settings'],
  ['manager', '/owner/managers'],
  ['manager', '/cashier/deposits'],
  ['manager', '/security/restrictions'],
  ['security', '/owner/treasury'],
  ['security', '/owner/payments'],
  ['security', '/cashier/deposits'],
  ['security', '/cashier/withdrawals'],
  ['security', '/manager/reports'],
  ['owner', '/cashier/deposits'],
  ['owner', '/security/restrictions'],
];

describe('role isolation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse()),
    );
  });

  it('denies cross-role routes even when the query claims another role', () => {
    for (const [role, path] of denied) {
      expect(accessDecision(fixtureSession(role), path, '?role=owner')).toBe('deny');
    }
    expect(accessDecision(fixtureSession('owner'), '/owner/treasury', '')).toBe('allow');
    expect(accessDecision(fixtureSession('manager'), '/manager/reports', '')).toBe('allow');
    expect(accessDecision(fixtureSession('cashier'), '/cashier/deposits', '')).toBe('allow');
    expect(accessDecision(fixtureSession('security'), '/security/audit', '')).toBe('allow');
  });

  it('rejects a server payload that mixes another role into the permission set', () => {
    const elevated = parseSession({
      sessionId: 'fixture-cashier-session',
      brandCode: '002',
      role: 'cashier',
      permissions: [...ROLE_CEILING.cashier, 'owner.treasury'],
      mfaSatisfied: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      staffId: 'fixture-cashier',
      displayName: 'Fixture cashier',
    });
    expect(elevated.ok).toBe(false);
    const managerTreasury = parseSession({
      sessionId: 'fixture-manager-session',
      brandCode: '002',
      role: 'manager',
      permissions: ['manager.dashboard', 'owner.treasury'],
      mfaSatisfied: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      staffId: 'fixture-manager',
      displayName: 'Fixture manager',
    });
    expect(managerTreasury.ok).toBe(false);
  });

  it('keeps the cashier out of owner treasury', async () => {
    render(
      <AuthTestProvider session={fixtureSession('cashier')}>
        <MemoryRouter initialEntries={['/owner/treasury?role=owner']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Сводка' })).toBeTruthy();
    expect(screen.getByText('Недостаточно прав для этого раздела.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Казначейство' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Казначейство' })).toBeNull();
    expect(screen.queryByLabelText('Сумма')).toBeNull();
  });

  it('keeps treasury away from the manager and security portals', async () => {
    const { unmount } = render(
      <AuthTestProvider session={fixtureSession('manager')}>
        <MemoryRouter initialEntries={['/owner/treasury']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Сводка' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Казначейство' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Финансовые отчёты' })).toBeTruthy();
    unmount();

    render(
      <AuthTestProvider session={fixtureSession('security')}>
        <MemoryRouter initialEntries={['/cashier/deposits']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Обзор безопасности' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Депозиты' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Казначейство' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ограничения счетов' })).toBeTruthy();
  });

  it('locks staff invitations to the screen role', async () => {
    const form = matchRoute('/owner/managers')?.form;
    if (!form) throw new Error('missing invite form');
    expect(form.fixed.role).toBe('manager');
    expect(form.fields.some((field) => field.name === 'role')).toBe(false);
    const errors = validateFields(form.fields, { email: 'person@rixobet.com', displayName: 'Тест Сотрудник' });
    expect(errors).toEqual({});
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return htmlResponse();
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await submitForm(form, { email: 'person@rixobet.com', displayName: 'Тест Сотрудник' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('disconnected');
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as { role?: string; audit?: { action?: string } };
    expect(body.role).toBe('manager');
    expect(body.audit?.action).toBe('owner.staff.invite.manager');
  });

  it('does not let the owner portal render inside the cashier session', async () => {
    render(
      <AuthTestProvider session={fixtureSession('owner')}>
        <MemoryRouter initialEntries={['/cashier/withdrawals']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Обзор' })).toBeTruthy();
    expect(screen.getByText('Недостаточно прав для этого раздела.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Казначейство' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Казначейство' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Запросить вывод' })).toBeNull();
  });
});
