import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "@/lib/hyperswitch";
import { HOLD_MINUTES } from "@/lib/payment-policy";

// The sandbox dummy connector reports succeeded at authorization and never
// sits in requires_capture, so the hold-expiry branch of this route cannot be
// reached against it. These tests stand in for a connector that honors
// capture_method: manual.

const api = vi.hoisted(() => ({
  retrievePayment: vi.fn(),
  capturePayment: vi.fn(),
  cancelPayment: vi.fn(),
}));

vi.mock("@/lib/hyperswitch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hyperswitch")>()),
  ...api,
  isConfigured: () => true,
}));

import { POST } from "./route";

const PAYMENT_ID = "pay_test0000000000000000000001";
const SECRET = `${PAYMENT_ID}_secret_abc123`;

function payment(overrides: Partial<Payment>): Payment {
  return {
    payment_id: PAYMENT_ID,
    status: "requires_capture",
    amount: 71975,
    currency: "USD",
    amount_capturable: 71975,
    amount_received: 0,
    client_secret: SECRET,
    created: new Date().toISOString(),
    ...overrides,
  };
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function post(clientSecret: string | undefined) {
  const request = new Request(`http://localhost/api/payments/${PAYMENT_ID}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(clientSecret === undefined ? {} : { client_secret: clientSecret }),
  }) as unknown as NextRequest;
  const response = await POST(request, { params: Promise.resolve({ paymentId: PAYMENT_ID }) });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.capturePayment.mockImplementation(async () => payment({ status: "succeeded", amount_received: 71975 }));
  api.cancelPayment.mockImplementation(async () => payment({ status: "cancelled" }));
});

describe("POST /api/payments/[paymentId]/capture", () => {
  it("refuses a caller without the payment's client_secret", async () => {
    api.retrievePayment.mockResolvedValue(payment({}));

    expect((await post(undefined)).status).toBe(403);
    expect((await post(`${PAYMENT_ID}_secret_somethingelse`)).status).toBe(403);
    expect(api.capturePayment).not.toHaveBeenCalled();
    expect(api.cancelPayment).not.toHaveBeenCalled();
  });

  it("captures an authorized payment inside the hold window", async () => {
    api.retrievePayment.mockResolvedValue(payment({ created: minutesAgo(1) }));

    const { status, body } = await post(SECRET);

    expect(status).toBe(200);
    expect(body.captured).toBe(true);
    expect(api.capturePayment).toHaveBeenCalledWith(PAYMENT_ID);
    expect(api.cancelPayment).not.toHaveBeenCalled();
  });

  it("voids an authorized payment whose hold has expired instead of capturing it", async () => {
    api.retrievePayment.mockResolvedValue(payment({ created: minutesAgo(HOLD_MINUTES + 1) }));

    const { status, body } = await post(SECRET);

    expect(status).toBe(200);
    expect(body.captured).toBe(false);
    expect(body.holdExpired).toBe(true);
    expect(api.cancelPayment).toHaveBeenCalledWith(PAYMENT_ID, "hold_expired");
    expect(api.capturePayment).not.toHaveBeenCalled();
  });

  it("returns an already captured payment as is", async () => {
    api.retrievePayment.mockResolvedValue(payment({ status: "succeeded", amount_received: 71975 }));

    const { status, body } = await post(SECRET);

    expect(status).toBe(200);
    expect(body.captured).toBe(false);
    expect(body.holdExpired).toBeUndefined();
    expect(api.capturePayment).not.toHaveBeenCalled();
    expect(api.cancelPayment).not.toHaveBeenCalled();
  });
});
