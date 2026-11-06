export const BRAND_CODES = ['001', '002', '003'] as const;

export type BrandCode = (typeof BRAND_CODES)[number];

export type BrandStatus = 'planned' | 'registered' | 'provisioning' | 'active' | 'suspended';

export interface BrandRecord {
  code: BrandCode;
  slug: string;
  displayName: string;
  status: BrandStatus;
}

export const GROUP_BRANDS: readonly BrandRecord[] = [
  { code: '001', slug: 'nextpari', displayName: 'NextPari', status: 'active' },
  { code: '002', slug: 'ryxo', displayName: 'RYXO', status: 'registered' },
  { code: '003', slug: 'future', displayName: 'Future brand', status: 'planned' },
];

export function isBrandCode(value: string): value is BrandCode {
  return (BRAND_CODES as readonly string[]).includes(value);
}
