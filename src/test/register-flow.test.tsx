import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import {
  generateBookingSessionToken,
  hashBookingSessionToken,
  constantTimeEqualHex,
} from "@/lib/registration.functions";

const mockCreateGuestRegistrationServer = vi.fn();
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
    sessionStorage.clear();
    mockCreateGuestRegistrationServer.mockReset();
    mockSubmitGuestPaymentServer.mockReset();
  });

  it("completes the full server-side guest registration and payment flow with booking session token verification", async () => {
    const sessionToken = "a".repeat(64);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const fakeSession = {
      id: "11111111-1111-4111-8111-111111111111",
      booking_id: "TB-COORG-TEST99",
      full_name: "Aarav Sharma",
      email: "aarav@mesabusinessschool.org",
      phone: "+919876543210",
      cohort: "Section A",
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
      session_token: "",
    });

    render(<RegisterComponent />);

    // 1. Confirm registration form renders directly without login/signup
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
    fireEvent.change(cohortSelect, { target: { value: "Section A" } });

    // 4. Accept mandatory checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    expect(continueBtn).not.toBeDisabled();

    // 5. Submit registration form -> calls secure server function
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText("gatepay.nkgsbank725538@icici")).toBeInTheDocument();
    });

    expect(mockCreateGuestRegistrationServer).toHaveBeenCalledWith({
      data: {
        fullName: "Aarav Sharma",
        email: "aarav@mesabusinessschool.org",
        phone: "+919876543210",
        cohort: "Section A",
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
    expect(screen.getByRole("link", { name: "PAY VIA UPI →" })).toBeInTheDocument();
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
});
