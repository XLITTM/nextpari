import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFICE_ROLES, PERMISSIONS, ROLE_CEILING, type OfficeRole } from '../access/model';
import { browserRole, canAccess } from '../access/guard';
import { AppRoutes } from '../App';
import { AuthTestProvider } from '../auth/AuthContext';
import { DevPreview } from '../preview/DevPreview';
import { homeFor, matchRoute, OFFICE_ROUTES, productionPaths, resolvePreview, routesFor } from '../nav/catalog';
import { fixtureSession, htmlResponse } from './fixtures';

const officeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('navigation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse()),
    );
  });

  it('lists every screen for the four roles and no preview route', () => {
    expect(OFFICE_ROUTES).toHaveLength(33);
    expect(routesFor('owner')).toHaveLength(12);
    expect(routesFor('manager')).toHaveLength(7);
    expect(routesFor('cashier')).toHaveLength(7);
    expect(routesFor('security')).toHaveLength(7);
    const paths = OFFICE_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const route of OFFICE_ROUTES) {
      expect(ROLE_CEILING[route.role]).toContain(route.permission);
      expect(route.permission.startsWith(`${route.role}.`)).toBe(true);
    }
    expect(PERMISSIONS).toHaveLength(33);
    expect(productionPaths(false).some((path) => path.includes('preview'))).toBe(false);
    expect(browserRole()).toBeNull();
    const source = readFileSync(resolve(officeRoot, 'src/App.tsx'), 'utf8');
    expect(source.includes('/dev/preview')).toBe(false);
  });

  it.each(OFFICE_ROLES)('opens every %s screen from its own menu', async (role: OfficeRole) => {
    const routes = routesFor(role);
    const home = routes.find((route) => route.home);
    if (!home) throw new Error('missing home');
    render(
      <AuthTestProvider session={fixtureSession(role)}>
        <MemoryRouter initialEntries={[home.path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: home.title })).toBeTruthy();
    expect(screen.queryByText('Сервер принял операцию')).toBeNull();
    expect(document.querySelector('[data-metric="server"]')).toBeNull();
    for (const route of routes) {
      fireEvent.click(screen.getByRole('link', { name: route.nav }));
      expect(await screen.findByRole('heading', { level: 1, name: route.title })).toBeTruthy();
      expect(screen.getByRole('link', { name: route.nav }).getAttribute('aria-current')).toBe('page');
      expect(screen.getAllByText('Не подключено').length).toBeGreaterThan(0);
    }
  });

  it('keeps the layout preview unauthenticated', async () => {
    const route = resolvePreview('/dev/preview/owner/treasury');
    expect(route?.path).toBe('/owner/treasury');
    expect(canAccess(null, route!)).toBe(false);
    expect(matchRoute('/dev/preview/owner')).toBeNull();
    render(
      <MemoryRouter initialEntries={['/cashier/deposits']}>
        <DevPreview />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Депозиты' })).toBeTruthy();
    expect(screen.getByText('Макет интерфейса. Сессия не выдана. Не подключено.')).toBeTruthy();
    expect(screen.queryByText('Сервер принял операцию')).toBeNull();
    expect(screen.queryByText(/Fixture/)).toBeNull();
  });

  it('sends the production preview url back to login', async () => {
    render(
      <AuthTestProvider session={null}>
        <MemoryRouter initialEntries={['/dev/preview/owner']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthTestProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Вход для сотрудников' })).toBeTruthy();
    expect(homeFor('owner')).toBe('/owner');
  });
});
