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

    // 1. Confirm NO login, OTP, or returning-student options exist anywhere on the page
    expect(screen.queryByText(/New Student — Register/i)).toBeNull();
    expect(screen.queryByText(/Already Registered\? Continue Your Booking/i)).toBeNull();
    expect(screen.queryByText(/Continue Your Booking/i)).toBeNull();
    expect(screen.queryByText(/Verification code/i)).toBeNull();
    expect(screen.queryByText(/Verify my email/i)).toBeNull();
    expect(screen.queryByText(/Password/i)).toBeNull();

    // 2. Check the 4 required fields + summary + terms checkboxes + button
    const nameInput = screen.getByPlaceholderText("Your full name");
    const emailInput = screen.getByPlaceholderText("you@mesabusinessschool.org");
    const phoneInput = screen.getByPlaceholderText("+91 98765 43210");
    const cohortSelect = screen.getByRole("combobox");

    expect(screen.getByText("COORG 2026")).toBeInTheDocument();
    expect(screen.getByText("20–22 NOVEMBER")).toBeInTheDocument();
    expect(screen.getByText("₹8,500 / PERSON")).toBeInTheDocument();

    const continueBtn = screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" });
    expect(continueBtn).toBeDisabled();

    // 3. Fill in the 4 personal details
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

    // 5. Submit registration form -> goes directly to payment page
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText("gatepay.nkgsbank725538@icici")).toBeInTheDocument();
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

    // 6. Verify payment page displays ₹8,500, QR code, UPI ID, PAY VIA UPI button, Save QR image, and Copy button
    expect(screen.getByText("TITU BACKPACKERS — COORG 2026")).toBeInTheDocument();
    expect(screen.getByText("₹8,500 / PERSON")).toBeInTheDocument();
    expect(screen.getByText("SCAN TO PAY")).toBeInTheDocument();
    expect(screen.getByText("Scan using any UPI app to complete your payment.")).toBeInTheDocument();
    expect(screen.getByAltText("UPI QR code for Titu Backpackers Coorg 2026 payment")).toBeInTheDocument();
    expect(screen.getByText("gatepay.nkgsbank725538@icici")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy UPI ID" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PAY VIA UPI →" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save QR image" })).toBeInTheDocument();

    // 7. Submit UTR and screenshot -> calls secure server function with booking session token
    const utrInput = screen.getByPlaceholderText("e.g. 431298765432");
    fireEvent.change(utrInput, { target: { value: "431298765432" } });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["dummy-image-bytes"], "payment.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [testFile], configurable: true });
    fireEvent.change(fileInput);

    const paymentForm = fileInput.closest("form")!;
    fireEvent.submit(paymentForm);

    // 8. Verify Pending Verification confirmation screen
    await waitFor(() => {
      expect(screen.getByText("YOU'RE ALMOST IN!")).toBeInTheDocument();
    });

    expect(mockSubmitGuestPaymentServer).toHaveBeenCalledWith({
      data: expect.objectContaining({
        registrationId: fakeSession.id,
        sessionToken: sessionToken,
        utr: "431298765432",
        fileType: "image/png",
        fileExt: "png",
      }),
    });

    expect(
      screen.getByText("Your payment details have been submitted and are awaiting verification."),
    ).toBeInTheDocument();
    expect(screen.getByText("Pending verification")).toBeInTheDocument();
    expect(screen.getByText("TB-COORG-TEST99")).toBeInTheDocument();
    expect(screen.getByText("431298765432")).toBeInTheDocument();
  });

  it("allows unlimited registrations using the same email and phone number without OTP or 'Email already registered' errors", async () => {
    const token1 = "1".repeat(64);
    const token2 = "2".repeat(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const firstBooking = {
      id: "11111111-1111-4111-8111-111111111111",
      booking_id: "TB-COORG-FIRST1",
      full_name: "Ananya Rao",
      email: "ananya@mesabusinessschool.org",
      phone: "+919876543219",
      cohort: "UGC 1",
      status: "registration_started",
      utr: null,
      session_token: token1,
      session_expires_at: expiresAt,
    };

    const secondBooking = {
      id: "22222222-2222-4222-8222-222222222222",
      booking_id: "TB-COORG-SECOND",
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
      .mockResolvedValueOnce(secondBooking);

    const { unmount } = render(<RegisterComponent />);

    // First registration with email + phone
    fireEvent.change(screen.getByPlaceholderText("Your full name"), {
      target: { value: "Ananya Rao" },
    });
    fireEvent.change(screen.getByPlaceholderText("you@mesabusinessschool.org"), {
      target: { value: "ananya@mesabusinessschool.org" },
    });
    fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), {
      target: { value: "+91 98765 43219" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "UGC 1" },
    });

    const checkboxes1 = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes1[0]!);
    fireEvent.click(checkboxes1[1]!);

    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" }));

    await waitFor(() => {
      expect(screen.getByText(/TB-COORG-FIRST1/)).toBeInTheDocument();
    });

    // Simulate student clearing storage or starting a new registration with the EXACT same email and phone
    unmount();
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();

    render(<RegisterComponent />);

    fireEvent.change(screen.getByPlaceholderText("Your full name"), {
      target: { value: "Ananya Rao" },
    });
    fireEvent.change(screen.getByPlaceholderText("you@mesabusinessschool.org"), {
      target: { value: "ananya@mesabusinessschool.org" },
    });
    fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), {
      target: { value: "+91 98765 43219" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "UGC 2" },
    });

    const checkboxes2 = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes2[0]!);
    fireEvent.click(checkboxes2[1]!);

    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" }));

    // Proceeds directly to payment with its own booking reference, no OTP or "Email already registered" error
    await waitFor(() => {
      expect(screen.getByText(/TB-COORG-SECOND/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/already registered/i)).toBeNull();
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

    fireEvent.change(screen.getByPlaceholderText("Your full name"), {
      target: { value: "Riya Patel" },
    });
    fireEvent.change(screen.getByPlaceholderText("you@mesabusinessschool.org"), {
      target: { value: "riya@mesabusinessschool.org" },
    });
    fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), {
      target: { value: "+91 98765 43211" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "UGC 1" },
    });

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    const continueBtn = screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" });

    // Rapidly click Submit multiple times -> only 1 server call is made
    fireEvent.click(continueBtn);
    fireEvent.click(continueBtn);
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText("SCAN TO PAY")).toBeInTheDocument();
    });
    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledTimes(1);

    // Go back from payment to registration
    fireEvent.click(screen.getByRole("button", { name: /Edit registration details/i }));
    expect(screen.getByDisplayValue("Riya Patel")).toBeInTheDocument();
    expect(screen.getByDisplayValue("riya@mesabusinessschool.org")).toBeInTheDocument();

    // Go back to payment without changing details -> reuses same pending registration without extra server call
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" }));
    await waitFor(() => {
      expect(screen.getByText("SCAN TO PAY")).toBeInTheDocument();
    });
    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledTimes(1);

    // Go back again and edit cohort from UGC 1 -> UGC 2 -> updates the SAME registration ID using sessionToken
    fireEvent.click(screen.getByRole("button", { name: /Edit registration details/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "UGC 2" } });
    fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" }));

    await waitFor(() => {
      expect(screen.getByText("SCAN TO PAY")).toBeInTheDocument();
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

    // Student refreshes or closes and reopens the website
    unmount();

    render(<RegisterComponent />);

    await waitFor(() => {
      expect(screen.getByText("SCAN TO PAY")).toBeInTheDocument();
    });
    expect(screen.getByText(/TB-COORG-MULTI1/)).toBeInTheDocument();
    expect(mockGetGuestRegistrationSessionServer).toHaveBeenCalledWith({
      data: {
        registrationId: session2.id,
        sessionToken: token2,
      },
    });
  });

  it("handles PAY VIA UPI on iPhone Safari without triggering generic upi:// (preventing WhatsApp popup)", async () => {
    const token = "d".repeat(64);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const session = {
      id: "11111111-1111-4111-8111-111111111111",
      booking_id: "TB-COORG-IOS123",
      full_name: "Kabir Verma",
      email: "kabir@mesabusinessschool.org",
      phone: "+919876543212",
      cohort: "UGC 1",
      status: "registration_started",
      utr: null,
      session_token: token,
      session_expires_at: expiresAt,
    };

    mockCreateGuestRegistrationServer.mockResolvedValue(session);

    const origUA = navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      configurable: true,
    });

    try {
      render(<RegisterComponent />);

      fireEvent.change(screen.getByPlaceholderText("Your full name"), {
        target: { value: "Kabir Verma" },
      });
      fireEvent.change(screen.getByPlaceholderText("you@mesabusinessschool.org"), {
        target: { value: "kabir@mesabusinessschool.org" },
      });
      fireEvent.change(screen.getByPlaceholderText("+91 98765 43210"), {
        target: { value: "+91 98765 43212" },
      });
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "UGC 1" },
      });

      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]!);
      fireEvent.click(checkboxes[1]!);
      fireEvent.click(screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "PAY VIA UPI →" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "PAY VIA UPI →" }));

      // Verify iOS UPI app chooser appears with valid app-specific deep links and no WhatsApp or generic upi:// link
      expect(screen.getByText("Choose your UPI app (iPhone)")).toBeInTheDocument();
      const gpayLink = screen.getByRole("link", { name: "Google Pay →" });
      const phonepeLink = screen.getByRole("link", { name: "PhonePe →" });
      const paytmLink = screen.getByRole("link", { name: "Paytm →" });
      const bhimLink = screen.getByRole("link", { name: "BHIM →" });

      expect(gpayLink.getAttribute("href")).toMatch(/^tez:\/\/upi\/pay\?/);
      expect(phonepeLink.getAttribute("href")).toMatch(/^phonepe:\/\/pay\?/);
      expect(paytmLink.getAttribute("href")).toMatch(/^paytmmp:\/\/pay\?/);
      expect(bhimLink.getAttribute("href")).toMatch(/^bhim:\/\/pay\?/);

      // Clear fallback instructions are displayed
      expect(screen.getByText(/Opening an app does not confirm payment/i)).toBeInTheDocument();
    } finally {
      Object.defineProperty(window.navigator, "userAgent", {
        value: origUA,
        configurable: true,
      });
    }
  });
});
