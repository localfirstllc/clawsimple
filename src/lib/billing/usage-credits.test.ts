import { describe, expect, it } from 'vitest';
import { validateUsageCreditCheckoutSession } from './usage-credits-validation';

describe('validateUsageCreditCheckoutSession', () => {
  const defaultUserId = 'user_123';
  const validCheckout = {
    payment_status: 'paid',
    status: 'complete',
    metadata: {
      user_id: defaultUserId,
      purchase_type: 'usage_credits',
      credits_usd: '10',
    },
  };

  it('validates a successful paid checkout session', () => {
    const result = validateUsageCreditCheckoutSession(validCheckout, defaultUserId);
    expect(result).toEqual({
      valid: true,
      creditsUsd: 10,
      purchaseType: 'usage_credits',
      userId: defaultUserId,
    });
  });

  it('accepts paid payment_status even if status is not complete', () => {
    const result = validateUsageCreditCheckoutSession(
      { ...validCheckout, status: 'open' },
      defaultUserId
    );
    expect(result.valid).toBe(true);
  });

  it('accepts complete status even if payment_status is not paid', () => {
    // This handles cases where 100% discount or other edge cases mark it complete without a new payment
    const result = validateUsageCreditCheckoutSession(
      { ...validCheckout, payment_status: 'no_payment_required' },
      defaultUserId
    );
    expect(result.valid).toBe(true);
  });

  it('rejects if neither paid nor complete', () => {
    const result = validateUsageCreditCheckoutSession(
      { ...validCheckout, payment_status: 'unpaid', status: 'open' },
      defaultUserId
    );
    expect(result).toEqual({
      valid: false,
      error: 'checkout_not_paid',
      status: 400,
    });
  });

  it('rejects if purchase_type is not usage_credits', () => {
    const result = validateUsageCreditCheckoutSession(
      {
        ...validCheckout,
        metadata: { ...validCheckout.metadata, purchase_type: 'subscription' },
      },
      defaultUserId
    );
    expect(result).toEqual({
      valid: false,
      error: 'invalid_checkout_session',
      status: 400,
    });
  });

  it('rejects if user_id in metadata does not match expected', () => {
    const result = validateUsageCreditCheckoutSession(validCheckout, 'different_user_456');
    expect(result).toEqual({
      valid: false,
      error: 'invalid_checkout_session',
      status: 400,
    });
  });

  it('rejects if user_id is missing from metadata', () => {
    const result = validateUsageCreditCheckoutSession(
      {
        ...validCheckout,
        metadata: { ...validCheckout.metadata, user_id: null },
      },
      defaultUserId
    );
    expect(result).toEqual({
      valid: false,
      error: 'invalid_checkout_session',
      status: 400,
    });
  });

  it('rejects if credits_usd is missing or invalid', () => {
    const tests = [null, 'abc', '-5', '0', undefined];
    for (const val of tests) {
      const result = validateUsageCreditCheckoutSession(
        {
          ...validCheckout,
          metadata: { ...validCheckout.metadata, credits_usd: val as unknown as string },
        },
        defaultUserId
      );
      expect(result).toEqual({
        valid: false,
        error: 'invalid_credit_amount',
        status: 400,
      });
    }
  });

  it('handles missing metadata gracefully', () => {
    const result = validateUsageCreditCheckoutSession(
      { payment_status: 'paid', status: 'complete', metadata: null },
      defaultUserId
    );
    expect(result).toEqual({
      valid: false,
      error: 'invalid_checkout_session',
      status: 400,
    });
  });
});
