import { createAuthAdminPort } from './staffAuthAdmin.js';
import { loadStaffOnboardingEnv } from './env.js';
import { StaffOnboardingError, staffError } from './errors.js';
import { normalizeEmail, normalizePassword } from './staffOnboardingService.js';
import { createServiceRoleClient } from '../supabase/admin.js';
import type { AuthAdminPort, StaffLog } from './types.js';

const FORBIDDEN_CREATE_KEYS = [
  'managerId',
  'manager_id',
  'p_manager_id',
  'networkId',
  'network_id',
  'p_network_id',
  'operationalAccountId',
  'operational_account_id',
  'actorUserId',
  'actor_user_id',
  'startingBalance',
  'starting_balance',
  'floatBalance',
  'float_balance',
  'p_float',
  'pin',
  'pinHash',
  'pin_hash',
  'p_pin',
] as const;

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function rejectForbiddenStaffCreateFields(body: unknown): Record<string, unknown> {
  const rec = asRecord(body);
  for (const key of FORBIDDEN_CREATE_KEYS) {
    if (rec[key] != null && rec[key] !== '') {
      throw staffError('FIELD_FORBIDDEN', 400);
    }
  }
  return rec;
}

export function liveAuthAdminPort(): AuthAdminPort {
  const env = loadStaffOnboardingEnv();
  return createAuthAdminPort(
    createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey),
  );
}

export async function provisionAuthThenBind(
  input: {
    email: unknown;
    temporaryPassword: unknown;
    bind: (authUserId: string) => Promise<unknown>;
  },
  ports: { admin: AuthAdminPort },
  log: StaffLog,
): Promise<unknown> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.temporaryPassword);
  const created = await ports.admin.createUser(email, password);
  try {
    return await input.bind(created.id);
  } catch (error) {
    try {
      await ports.admin.deleteUser(created.id);
    } catch {
      log.error('staff_hierarchy_compensation_failed', {
        authUserId: created.id,
        errorCode: error instanceof StaffOnboardingError ? error.code : 'BIND_FAILED',
      });
      throw staffError('ONBOARDING_COMPENSATION_FAILED', 500, {
        authUserId: created.id,
      });
    }
    throw error;
  }
}

export async function provisionOwnerManager(input: {
  body: unknown;
  admin: AuthAdminPort;
  invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  log: StaffLog;
}): Promise<unknown> {
  const rec = rejectForbiddenStaffCreateFields(input.body);
  return provisionAuthThenBind(
    {
      email: rec.email,
      temporaryPassword: rec.temporaryPassword ?? rec.password,
      bind: (authUserId) =>
        input.invoke('owner_provision_manager', {
          p_auth_user_id: authUserId,
          p_login: rec.login,
          p_full_name: rec.fullName ?? rec.full_name,
          p_network_name: rec.networkName ?? rec.network_name,
        }),
    },
    { admin: input.admin },
    input.log,
  );
}

export async function provisionManagerCashier(input: {
  body: unknown;
  admin: AuthAdminPort;
  invoke: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  log: StaffLog;
}): Promise<unknown> {
  const rec = rejectForbiddenStaffCreateFields(input.body);
  return provisionAuthThenBind(
    {
      email: rec.email,
      temporaryPassword: rec.temporaryPassword ?? rec.password,
      bind: (authUserId) =>
        input.invoke('manager_provision_cashier', {
          p_auth_user_id: authUserId,
          p_login: rec.login,
          p_full_name: rec.fullName ?? rec.full_name,
          p_city: rec.city,
          p_point_name: rec.pointName ?? rec.point_name,
        }),
    },
    { admin: input.admin },
    input.log,
  );
}
