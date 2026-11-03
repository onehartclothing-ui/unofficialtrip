import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import {
  generateBookingSessionToken,
  hashBookingSessionToken,
  constantTimeEqualHex,
} from "@/lib/registration.functions";

const mockCreateGuestRegistrationServer = vi.fn();
const mockGetGuestRegistrationSessionServer = vi.fn();
const mockSubmitGuestPaymentServer = vi.fn();
const mockCreateRazorpayOrderServer = vi.fn();
const mockVerifyRazorpayPaymentServer = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => opts,
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/registration.functions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/registration.functions")>();
  return {
    ...actual,
    createGuestRegistrationServer: (...args: unknown[]) => mockCreateGuestRegistrationServer(...args),
    getGuestRegistrationSessionServer: (...args: unknown[]) => mockGetGuestRegistrationSessionServer(...args),
    submitGuestPaymentServer: (...args: unknown[]) => mockSubmitGuestPaymentServer(...args),
  };
});

vi.mock("@/lib/razorpay.functions", () => ({
  createRazorpayOrderServer: (...args: unknown[]) => mockCreateRazorpayOrderServer(...args),
  verifyRazorpayPaymentServer: (...args: unknown[]) => mockVerifyRazorpayPaymentServer(...args),
}));

import { Route as RegisterRoute } from "@/routes/register";

describe("Booking session token security", () => {
  it("generates a cryptographically random 64-hex-char (256-bit) token and hashes with SHA-256", async () => {
    const tokenA = generateBookingSessionToken();
    const tokenB = generateBookingSessionToken();
    expect(tokenA).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenB).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenA).not.toBe(tokenB);

    const hashA1 = await hashBookingSessionToken(tokenA);
    const hashA2 = await hashBookingSessionToken(tokenA);
    const hashB = await hashBookingSessionToken(tokenB);

    expect(hashA1).toMatch(/^[0-9a-f]{64}$/);
    expect(constantTimeEqualHex(hashA1, hashA2)).toBe(true);
    expect(constantTimeEqualHex(hashA1, hashB)).toBe(false);
  });
});

describe("Guest registration & payment flow (/register)", () => {
  const RegisterComponent = (RegisterRoute as unknown as { component: React.ComponentType }).component;

  beforeEach(() => {
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();
    mockCreateGuestRegistrationServer.mockReset();
    mockGetGuestRegistrationSessionServer.mockReset();
    mockSubmitGuestPaymentServer.mockReset();
  });

  it("renders a single simple registration form with no OTP, login, or returning-student options and proceeds directly to payment", async () => {
    const sessionToken = "a".repeat(64);
    const rotatedToken = "e".repeat(64);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const fakeSession = {
      id: "11111111-1111-4111-8111-111111111111",
      booking_id: "TB-COORG-TEST99",
      full_name: "Aarav Sharma",
      email: "aarav@mesabusinessschool.org",
      phone: "+919876543210",
      cohort: "UGC 1",
      status: "registration_started",
      utr: null,
      session_token: sessionToken,
      session_expires_at: expiresAt,
    };

    mockCreateGuestRegistrationServer.mockResolvedValue(fakeSession);
    mockSubmitGuestPaymentServer.mockResolvedValue({
      ...fakeSession,
      status: "pending_verification",
      utr: "431298765432",
      session_token: rotatedToken,
    });

    render(<RegisterComponent />);

    // 1. Verify NO returning-student section, OTP, magic link, or login options exist
    expect(screen.queryByText(/New Student — Register/i)).toBeNull();
    expect(screen.queryByText(/Already Registered\? Continue Your Booking/i)).toBeNull();
    expect(screen.queryByText(/Continue Your Booking/i)).toBeNull();
    expect(screen.queryByText(/SEND VERIFICATION CODE/i)).toBeNull();
    expect(screen.queryByText(/Verify my email/i)).toBeNull();
    expect(screen.queryByText(/Password/i)).toBeNull();

    // 2. Check the form fields + summary + terms checkboxes + button
    const nameInput = screen.getByPlaceholderText("Enter your full name");
    const emailInput = screen.getByPlaceholderText("Enter your email address (optional)");
    const phoneInput = screen.getByPlaceholderText("Enter your 10-digit mobile number");
    const cohortSelect = screen.getByRole("combobox");

    expect(screen.getByText("COORG 2026")).toBeInTheDocument();
    expect(screen.getByText("20–22 NOVEMBER")).toBeInTheDocument();
    expect(screen.getByText("₹8,500 / PERSON")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your booking confirmation and trip details will be shared via your registered phone number and email address (if provided).",
      ),
    ).toBeInTheDocument();

    const continueBtn = screen.getByRole("button", { name: "CONTINUE TO PAYMENT — ₹8,500" });
    expect(continueBtn).toBeDisabled();

    // 3. Fill in details (name, phone, cohort with optional email)
    fireEvent.change(nameInput, { target: { value: "Aarav Sharma" } });
    fireEvent.change(emailInput, { target: { value: "aarav@mesabusinessschool.org" } });
    fireEvent.change(phoneInput, { target: { value: "+91 98765 43210" } });
    fireEvent.change(cohortSelect, { target: { value: "UGC 1" } });

    // 4. Accept mandatory checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    expect(continueBtn).not.toBeDisabled();

    // 5. Submit registration form -> proceeds directly to payment without OTP
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });

    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledWith({
      data: {
        fullName: "Aarav Sharma",
        email: "aarav@mesabusinessschool.org",
        phone: "+919876543210",
        cohort: "UGC 1",
        registrationId: undefined,
        sessionToken: undefined,
      },
    });

    // 6. Verify payment page displays Booking Reference, ₹8,500, and PAY ₹8,500 SECURELY button
    expect(screen.getByText("Step 2 of 2 · Secure Payment")).toBeInTheDocument();
    expect(screen.getByText("Confirm & Pay.")).toBeInTheDocument();
    expect(screen.getByText("TB-COORG-TEST99")).toBeInTheDocument();
    expect(screen.getByText("₹8,500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    expect(screen.getByText(/256-bit encrypted checkout powered by Razorpay/i)).toBeInTheDocument();

    // Verify OLD manual UPI & QR components are completely removed
    expect(screen.queryByText("SCAN TO PAY")).toBeNull();
    expect(screen.queryByAltText("UPI QR code for Titu Backpackers Coorg 2026 payment")).toBeNull();
    expect(screen.queryByText("gatepay.nkgsbank725538@icici")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy UPI ID" })).toBeNull();
    expect(screen.queryByRole("button", { name: "PAY VIA UPI →" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Save QR image" })).toBeNull();
    expect(screen.queryByPlaceholderText("e.g. 431298765432")).toBeNull();

    // 7. Click PAY ₹8,500 SECURELY -> opens Razorpay checkout and completes payment
    const win = window as unknown as {
      Razorpay?: unknown;
    };

    let checkoutHandler: ((res: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void) | null = null;
    class MockRazorpayClient {
      constructor(options: { handler: typeof checkoutHandler }) {
        checkoutHandler = options.handler;
      }
      open = vi.fn();
      on = vi.fn();
    }
    win.Razorpay = MockRazorpayClient;

    mockCreateRazorpayOrderServer.mockResolvedValue({
      order_id: "order_test_123",
      amount: 850000,
      currency: "INR",
      key_id: "rzp_test_TvmDWL1SNFJlcZ",
      name: "Titu Backpackers",
      description: "Coorg 2026 Student Trip",
      prefill: {
        name: "Aarav Sharma",
        email: "aarav@mesabusinessschool.org",
        contact: "+919876543210",
      },
      notes: {},
    });

    mockVerifyRazorpayPaymentServer.mockResolvedValue({
      ...fakeSession,
      status: "confirmed",
      utr: "pay_test_999",
      session_token: rotatedToken,
    });

    fireEvent.click(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" }));

    await waitFor(() => {
      expect(mockCreateRazorpayOrderServer).toHaveBeenCalledWith({
        data: {
          registrationId: fakeSession.id,
          sessionToken: sessionToken,
        },
      });
    });

    // Simulate successful payment callback from Razorpay
    if (checkoutHandler) {
      await (checkoutHandler as any)({
        razorpay_payment_id: "pay_test_999",
        razorpay_order_id: "order_test_123",
        razorpay_signature: "valid_mock_signature",
      });
    }

    // 8. Verify Payment Verified / Confirmed screen
    await waitFor(() => {
      expect(screen.getByText("You're officially going to Coorg!")).toBeInTheDocument();
    });

    expect(screen.getByText("Payment verified ✓")).toBeInTheDocument();
    expect(screen.getByText("TB-COORG-TEST99")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download confirmation" })).toBeInTheDocument();
  });

  it("allows unlimited registrations using the same email and phone number without OTP or 'Email already registered' errors", async () => {
    const token1 = "1".repeat(64);
    const token2 = "2".repeat(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const firstBooking = {
      id: "11111111-1111-4111-8111-111111111111",
      booking_id: "TB-COORG-ATTMP1",
      full_name: "Ananya Rao",
      email: "ananya@mesabusinessschool.org",
      phone: "+919876543219",
      cohort: "UGC 1",
      status: "registration_started",
      utr: null,
      session_token: token1,
      session_expires_at: expiresAt,
    };

    const secondBookingSameEmail = {
      id: "22222222-2222-4222-8222-222222222222",
      booking_id: "TB-COORG-ATTMP2",
      full_name: "Ananya Rao",
      email: "ananya@mesabusinessschool.org",
      phone: "+919876543219",
      cohort: "UGC 2",
      status: "registration_started",
      utr: null,
      session_token: token2,
      session_expires_at: expiresAt,
    };

    mockCreateGuestRegistrationServer
      .mockResolvedValueOnce(firstBooking)
      .mockResolvedValueOnce(secondBookingSameEmail);

    const { unmount } = render(<RegisterComponent />);

    // First registration with email + phone
    fireEvent.change(screen.getByPlaceholderText("Enter your full name"), {
      target: { value: "Ananya Rao" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email address (optional)"), {
      target: { value: "ananya@mesabusinessschool.org" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your 10-digit mobile number"), {
      target: { value: "+91 98765 43219" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "UGC 1" },
    });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT — ₹8,500" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });
    expect(screen.getByText(/TB-COORG-ATTMP1/)).toBeInTheDocument();

    // Student closes browser / clears session or clicks "Start a new registration →" and registers again with the SAME email and phone
    unmount();
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();

    render(<RegisterComponent />);

    fireEvent.change(screen.getByPlaceholderText("Enter your full name"), {
      target: { value: "Ananya Rao" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email address (optional)"), {
      target: { value: "ananya@mesabusinessschool.org" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your 10-digit mobile number"), {
      target: { value: "+91 98765 43219" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "UGC 2" },
    });

    const checkboxes2 = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes2[0]!);
    fireEvent.click(checkboxes2[1]!);
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT — ₹8,500" }));

    // Proceeds directly to payment with new booking reference TB-COORG-ATTMP2 and zero OTP or "Email already registered" errors
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });
    expect(screen.getByText(/TB-COORG-ATTMP2/)).toBeInTheDocument();
    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledTimes(2);
  });

  it("supports multiple visits, going back and forth, refreshing/reopening, and prevents duplicate registrations on repeated clicks", async () => {
    const token1 = "b".repeat(64);
    const token2 = "c".repeat(64);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const session1 = {
      id: "11111111-1111-4111-8111-111111111111",
      booking_id: "TB-COORG-MULTI1",
      full_name: "Riya Patel",
      email: "riya@mesabusinessschool.org",
      phone: "+919876543211",
      cohort: "UGC 1",
      status: "registration_started",
      utr: null,
      session_token: token1,
      session_expires_at: expiresAt,
    };

    const session2 = {
      ...session1,
      cohort: "UGC 2",
      session_token: token2,
    };

    // Delay first resolution slightly to test double-click protection
    mockCreateGuestRegistrationServer
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(session1), 30)),
      )
      .mockResolvedValueOnce(session2);

    mockGetGuestRegistrationSessionServer.mockResolvedValue(session2);

    const { unmount } = render(<RegisterComponent />);

    fireEvent.change(screen.getByPlaceholderText("Enter your full name"), {
      target: { value: "Riya Patel" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your email address (optional)"), {
      target: { value: "riya@mesabusinessschool.org" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your 10-digit mobile number"), {
      target: { value: "+91 98765 43211" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "UGC 1" },
    });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    const continueBtn = screen.getByRole("button", { name: "CONTINUE TO PAYMENT — ₹8,500" });

    // Rapidly click Submit multiple times -> only 1 server call is made
    fireEvent.click(continueBtn);
    fireEvent.click(continueBtn);
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });
    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledTimes(1);

    // Go back from payment to registration
    fireEvent.click(screen.getByRole("button", { name: /Edit registration details/i }));
    expect(screen.getByDisplayValue("Riya Patel")).toBeInTheDocument();
    expect(screen.getByDisplayValue("riya@mesabusinessschool.org")).toBeInTheDocument();

    // Go back to payment without changing details -> reuses same pending registration without extra server call
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT — ₹8,500" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });
    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledTimes(1);

    // Go back again and edit cohort from UGC 1 -> UGC 2 -> updates the SAME registration ID using sessionToken
    fireEvent.click(screen.getByRole("button", { name: /Edit registration details/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "UGC 2" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT — ₹8,500" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });
    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledTimes(2);
    expect(mockCreateGuestRegistrationServer).toHaveBeenLastCalledWith({
      data: {
        fullName: "Riya Patel",
        email: "riya@mesabusinessschool.org",
        phone: "+919876543211",
        cohort: "UGC 2",
        registrationId: session1.id,
        sessionToken: token1,
      },
    });

    // Student refreshes or closes and reopens the website -> payment page is restored without login
    unmount();

    render(<RegisterComponent />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });
    expect(screen.getByText(/TB-COORG-MULTI1/)).toBeInTheDocument();
    expect(mockGetGuestRegistrationSessionServer).toHaveBeenCalledWith({
      data: {
        registrationId: session2.id,
        sessionToken: token2,
      },
    });
  });

  it("displays Razorpay as the ONLY payment method with PAY ₹8,500 SECURELY button and no UPI QR/UTR inputs", async () => {
    const token = "d".repeat(64);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const session = {
      id: "11111111-1111-4111-8111-111111111111",
      booking_id: "TB-COORG-IOS123",
      full_name: "Kabir Verma",
      email: null,
      phone: "+919876543212",
      cohort: "UGC 1",
      status: "registration_started",
      utr: null,
      session_token: token,
      session_expires_at: expiresAt,
    };

    mockCreateGuestRegistrationServer.mockResolvedValue(session);

    render(<RegisterComponent />);

    fireEvent.change(screen.getByPlaceholderText("Enter your full name"), {
      target: { value: "Kabir Verma" },
    });
    // Leave email blank (testing optional email)
    fireEvent.change(screen.getByPlaceholderText("Enter your 10-digit mobile number"), {
      target: { value: "+91 98765 43212" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "UGC 1" },
    });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT — ₹8,500" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PAY ₹8,500 SECURELY" })).toBeInTheDocument();
    });

    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledWith({
      data: {
        fullName: "Kabir Verma",
        email: null,
        phone: "+919876543212",
        cohort: "UGC 1",
        registrationId: undefined,
        sessionToken: undefined,
      },
    });

    // Ensure all legacy UPI items are NOT rendered
    expect(screen.queryByText("PAY VIA UPI →")).toBeNull();
    expect(screen.queryByText("Save QR image")).toBeNull();
    expect(screen.queryByText("Copy UPI ID")).toBeNull();
    expect(screen.queryByText("SCAN TO PAY")).toBeNull();
    expect(screen.queryByPlaceholderText("e.g. 431298765432")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
