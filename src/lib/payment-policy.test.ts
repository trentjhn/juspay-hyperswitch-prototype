import { describe, expect, it } from "vitest";
import {
  allowedPaymentMethodTypes,
  authenticationTypeFor,
  BNPL_MINIMUM_CENTS,
  HOLD_MINUTES,
  holdExpiresAt,
  THREE_DS_THRESHOLD_CENTS,
} from "./payment-policy";

// The thresholds are the only business logic in the app, and the boundary is
// where an off-by-one would send a $500 order through without 3DS or offer
// Affirm on a $49.99 cart. Each test sits one cent on either side.

describe("Affirm at the $50 floor", () => {
  it("is absent at $49.99", () => {
    expect(allowedPaymentMethodTypes(BNPL_MINIMUM_CENTS - 1)).not.toContain("affirm");
  });

  it("is present at $50.00", () => {
    expect(allowedPaymentMethodTypes(BNPL_MINIMUM_CENTS)).toContain("affirm");
  });
});

describe("3DS at the $500 line", () => {
  it("is no_three_ds at $499.99", () => {
    expect(authenticationTypeFor(THREE_DS_THRESHOLD_CENTS - 1)).toBe("no_three_ds");
  });

  it("is three_ds at $500.00", () => {
    expect(authenticationTypeFor(THREE_DS_THRESHOLD_CENTS)).toBe("three_ds");
  });
});

describe("hold expiry", () => {
  const created = "2026-09-14T20:00:00.000Z";
  const expiresAt = holdExpiresAt(created);

  it("is still open one second before the hold length", () => {
    const oneSecondBefore = new Date(Date.parse(created) + HOLD_MINUTES * 60_000 - 1_000);
    expect(expiresAt < oneSecondBefore).toBe(false);
  });

  it("has expired at exactly the hold length", () => {
    const atExpiry = new Date(Date.parse(created) + HOLD_MINUTES * 60_000);
    expect(expiresAt <= atExpiry).toBe(true);
  });
});
