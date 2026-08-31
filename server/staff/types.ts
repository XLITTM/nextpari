export interface StaffBindingRow {
  authUserId: string;
  role: string;
  status: string;
  displayName: string | null;
  networkId: string | null;
  legacyManagerAccountId: string | null;
  legacyCashierId: string | null;
}

export interface StaffBindResult extends StaffBindingRow {
  ok: boolean;
  isDuplicate: boolean;
}

export interface OwnerStaffPort {
  currentStaffContext(): Promise<Record<string, unknown>>;
  listStaffAuthBindings(
    role: 'manager' | 'cashier',
    limit: number,
    offset: number,
  ): Promise<{ rows: StaffBindingRow[]; total: number }>;
  bindManager(authUserId: string, managerId: string): Promise<StaffBindResult>;
  bindCashier(authUserId: string, cashierId: string): Promise<StaffBindResult>;
}

export interface AuthAdminPort {
  createUser(email: string, password: string): Promise<{ id: string }>;
  deleteUser(id: string): Promise<void>;
}

export interface StaffLog {
  error(event: string, fields: Record<string, unknown>): void;
}

export type StaffOnboardRole = 'manager' | 'cashier';

export interface StaffOnboardInput {
  role: StaffOnboardRole;
  accessToken: string;
  email: unknown;
  temporaryPassword: unknown;
  managerId?: unknown;
  cashierId?: unknown;
}

export interface StaffOnboardSuccess {
  ok: true;
  authUserId: string;
  role: 'manager' | 'cashier';
  status: string;
  displayName: string | null;
  networkId: string | null;
  legacyManagerAccountId: string | null;
  legacyCashierId: string | null;
}
