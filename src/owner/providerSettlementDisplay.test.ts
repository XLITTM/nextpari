import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatNullableProviderMoney,
  formatProviderCommercialTerms,
} from './providerSettlementDisplay';

describe('owner provider settlement display', () => {
  it('renders a dash when provider-reported values are unavailable', () => {
    assert.equal(formatNullableProviderMoney(null, () => 'x'), '—');
  });

  it('renders Не настроено when commercial terms are absent', () => {
    assert.equal(formatProviderCommercialTerms({
      commissionFee: null,
      commercialTerms: null,
      formatMoney: (amount) => String(amount),
    }), 'Не настроено');
  });
});
