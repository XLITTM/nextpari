export const BRAND = {
  name: 'RIXO BET',
  code: '002',
  staffDomain: 'office.rixobet.com',
  product: 'backoffice',
} as const;

export type BrandCode = typeof BRAND.code;
