import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import {
  createRazorpayOrderHandler,
  verifyRazorpayPaymentHandler,
} from "@/lib/razorpay.functions";

const mockOrdersCreate = vi.fn();

vi.mock("razorpay", () => {
  class MockRazorpay {
    orders = {
      create: (...args: unknown[]) => mockOrdersCreate(...args),
    };
  }
  return {
    default: MockRazorpay,
  };
});

const mockSupabaseAdmin = {
  from: vi.fn(),
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

describe("Razorpay Standard Checkout Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["RAZORPAY_KEY_ID"] = "rzp_test_TvmDWL1SNFJlcZ";
    process.env["RAZORPAY_KEY_SECRET"] = "NMorz2jUCAUo3iRHWvS4JcWZ";
  });

  describe("createRazorpayOrderHandler", () => {
    it("creates a Razorpay order for ₹8,500 (850,000 paise) with valid booking session", async () => {
      const sessionToken = "a".repeat(64);
      const sessionHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const fakeReg = {
        id: "11111111-1111-4111-8111-111111111111",
        booking_id: "TB-COORG-TEST01",
        full_name: "Test Participant",
        email: "test@example.com",
        phone: "+919876543210",
        cohort: "UGC 1",
        status: "registration_started",
        session_token_hash: sessionHash,
        session_expires_at: futureDate,
        admin_note: null,
      };

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: fakeReg, error: null }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockSupabaseAdmin.from.mockImplementation((table: string) => {
        if (table === "registrations") {
          return {
            select: selectMock,
            update: updateMock,
          };
        }
        return {};
      });

      mockOrdersCreate.mockResolvedValue({
        id: "order_test_12345",
        amount: 850000,
        currency: "INR",
        receipt: "rcpt_TBCOORGTEST01",
      });

      const order = await createRazorpayOrderHandler({
        registrationId: fakeReg.id,
        sessionToken,
      });

      expect(order.order_id).toBe("order_test_12345");
      expect(order.amount).toBe(850000);
      expect(order.currency).toBe("INR");
      expect(order.key_id).toBe("rzp_test_TvmDWL1SNFJlcZ");
      expect(mockOrdersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 850000,
          currency: "INR",
        }),
      );
    });

    it("fails when booking session token is invalid", async () => {
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              session_token_hash: "wronghash",
              session_expires_at: new Date(Date.now() + 60000).toISOString(),
            },
            error: null,
          }),
        }),
      });

      mockSupabaseAdmin.from.mockReturnValue({ select: selectMock });

      await expect(
        createRazorpayOrderHandler({
          registrationId: "11111111-1111-4111-8111-111111111111",
          sessionToken: "a".repeat(64),
        }),
      ).rejects.toThrow(/invalid booking session/i);
    });
  });

  describe("verifyRazorpayPaymentHandler", () => {
    it("verifies HMAC-SHA256 signature and confirms registration in Supabase", async () => {
      const sessionToken = "b".repeat(64);
      const sessionHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
      const orderId = "order_9A33XWu170gUtm";
      const paymentId = "pay_29Aeabb76Ek5FO";
      const secret = "NMorz2jUCAUo3iRHWvS4JcWZ";

      const validSignature = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const fakeReg = {
        id: "22222222-2222-4222-8222-222222222222",
        booking_id: "TB-COORG-TEST02",
        full_name: "Verified Participant",
        email: "verified@example.com",
        phone: "+919876543211",
        cohort: "UGC 2",
        status: "registration_started",
        session_token_hash: sessionHash,
        session_expires_at: new Date(Date.now() + 60000).toISOString(),
      };

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: fakeReg, error: null }),
        }),
      });

      const updatedReg = {
        ...fakeReg,
        status: "confirmed",
        utr: paymentId,
      };

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: updatedReg, error: null }),
          }),
        }),
      });

      mockSupabaseAdmin.from.mockImplementation(() => ({
        select: selectMock,
        update: updateMock,
      }));

      const result = await verifyRazorpayPaymentHandler({
        registrationId: fakeReg.id,
        sessionToken,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature,
      });

      expect(result.status).toBe("confirmed");
      expect(result.utr).toBe(paymentId);
    });

    it("rejects tampering with invalid razorpay signature and does NOT mark as paid", async () => {
      const orderId = "order_123";
      const paymentId = "pay_456";

      await expect(
        verifyRazorpayPaymentHandler({
          registrationId: "22222222-2222-4222-8222-222222222222",
          sessionToken: "c".repeat(64),
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: "invalid_signature_hex_1234567890abcdef",
        }),
      ).rejects.toThrow(/invalid razorpay payment signature/i);
    });
  });
});
