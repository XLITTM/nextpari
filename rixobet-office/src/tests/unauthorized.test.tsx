import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessDecision, landingPath } from '../access/guard';
import { parseSession } from '../access/session';
import { AppRoutes } from '../App';
import { AuthProvider, AuthTestProvider } from '../auth/AuthContext';
import { fixtureSession, htmlResponse, jsonResponse } from './fixtures';
import { ROLE_CEILING } from '../access/model';

const search = '?role=owner&brand=001&as=security';

describe('unauthorized access', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse()),
    );
  });

  it('ignores role and brand claims in the address', async () => {
    expect(accessDecision(null, '/owner', search)).toBe('login');
    expect(accessDecision(null, '/manager', search)).toBe('login');
    expect(accessDecision(null, '/cashier/deposits', search)).toBe('login');
    expect(accessDecision(null, '/security', search)).toBe('login');
    expect(accessDecision(fixtureSession('cashier'), '/owner/treasury', search)).toBe('deny');
    expect(landingPath(fixtureSession('cashier'), '/owner/treasury?role=owner')).toBe('/cashier');
    expect(landingPath(fixtureSession('owner'), 'https://example.test/owner')).toBe('/owner');
    expect(landingPath(fixtureSession('owner'), '//example.test')).toBe('/owner');

    render(
      <AuthTestProvider session={null}>
        <MemoryRouter initialEntries={[`/owner/treasury${search}`]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Вход для сотрудников' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Казначейство' })).toBeNull();
  });

  it('rejects a session the server did not bind to brand 002', () => {
    const rejected = parseSession({
      sessionId: 'fixture-owner-session',
      brandCode: '001',
      role: 'owner',
      permissions: [...ROLE_CEILING.owner],
      mfaSatisfied: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      staffId: 'fixture-owner',
      displayName: 'Fixture owner',
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe('brand');

    const expired = parseSession(
      {
        sessionId: 'fixture-owner-session',
        brandCode: '002',
        role: 'owner',
        permissions: [...ROLE_CEILING.owner],
        mfaSatisfied: true,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        staffId: 'fixture-owner',
        displayName: 'Fixture owner',
      },
      Date.now(),
    );
    expect(expired.ok).toBe(false);

    const withoutMfa = parseSession({
      ...{
        sessionId: 'fixture-owner-session',
        brandCode: '002',
        role: 'owner',
        permissions: [...ROLE_CEILING.owner],
        mfaSatisfied: 'true',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        staffId: 'fixture-owner',
        displayName: 'Fixture owner',
      },
    });
    expect(withoutMfa.ok).toBe(false);
    if (!withoutMfa.ok) expect(withoutMfa.reason).toBe('mfa');
  });

  it('drops a server session on logout when revocation is offline', async () => {
    const session = {
      sessionId: 'fixture-owner-session',
      brandCode: '002',
      role: 'owner',
      permissions: [...ROLE_CEILING.owner],
      mfaSatisfied: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      staffId: 'fixture-owner',
      displayName: 'Fixture owner',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) return jsonResponse(session);
        return htmlResponse();
      }),
    );
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/owner']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Обзор' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('heading', { name: 'Вход для сотрудников' })).toBeTruthy();
    expect(screen.queryByText('Fixture owner')).toBeNull();
  });
});
