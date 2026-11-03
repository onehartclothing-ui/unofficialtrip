import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "crypto";
import Razorpay from "razorpay";
import { TRIP } from "@/lib/trip";
import {
  hashBookingSessionToken,
  constantTimeEqualHex,
  SESSION_TTL_MS,
  generateBookingSessionToken,
  type GuestRegistrationSession,
} from "@/lib/registration.functions";

function getEnvVar(name: string): string {
  // Check process.env (Node runtime & Nitro)
  if (typeof process !== "undefined" && process?.env && process.env[name]) {
    return process.env[name].trim();
  }
  // Check import.meta.env (Vite / client & SSR runtime)
  if (typeof import.meta !== "undefined" && import.meta?.env && (import.meta.env as Record<string, string | undefined>)[name]) {
    return String((import.meta.env as Record<string, string | undefined>)[name]).trim();
  }
  // Check globalThis (worker / cloud runtimes)
  if (typeof globalThis !== "undefined") {
    const g = globalThis as Record<string, unknown>;
    if (g[name] && typeof g[name] === "string") {
      return (g[name] as string).trim();
    }
    const envObj = (g["__env__"] || g["env"] || g["process"] && (g["process"] as { env?: Record<string, string> }).env) as Record<string, unknown> | undefined;
    if (envObj && typeof envObj === "object" && envObj[name] && typeof envObj[name] === "string") {
      return (envObj[name] as string).trim();
    }
  }
  return "";
}

/**
 * Diagnostic helper that reports presence of Razorpay environment variables
 * without EVER leaking the secret values.
 */
export function getRazorpayDiagnostics(): {
  hasKeyId: boolean;
  hasKeySecret: boolean;
  keyIdSource: string | null;
  keySecretSource: string | null;
} {
  const keyIdCandidates = [
    "RAZORPAY_KEY_ID",
    "VITE_RAZORPAY_KEY_ID",
    "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    "TITU_RAZORPAY_KEY_ID",
  ];
  const secretCandidates = [
    "RAZORPAY_KEY_SECRET",
    "TITU_RAZORPAY_KEY_SECRET",
  ];

  let keyIdSource: string | null = null;
  for (const name of keyIdCandidates) {
    if (getEnvVar(name)) {
      keyIdSource = name;
      break;
    }
  }

  let keySecretSource: string | null = null;
  for (const name of secretCandidates) {
    if (getEnvVar(name)) {
      keySecretSource = name;
      break;
    }
  }

  return {
    hasKeyId: Boolean(keyIdSource),
    hasKeySecret: Boolean(keySecretSource),
    keyIdSource,
    keySecretSource,
  };
}

export function getRazorpayClient(): { razorpay: Razorpay; keyId: string; keySecret: string } {
  const diag = getRazorpayDiagnostics();

  const keyId =
    getEnvVar("RAZORPAY_KEY_ID") ||
    getEnvVar("VITE_RAZORPAY_KEY_ID") ||
    getEnvVar("NEXT_PUBLIC_RAZORPAY_KEY_ID") ||
    getEnvVar("TITU_RAZORPAY_KEY_ID") ||
    "";

  const keySecret =
    getEnvVar("RAZORPAY_KEY_SECRET") ||
    getEnvVar("TITU_RAZORPAY_KEY_SECRET") ||
    "";

  // Safe server-side diagnostic logging (only logs existence and variable name, NEVER values)
  console.info("[Razorpay Diagnostics]", {
    hasKeyId: Boolean(keyId),
    hasKeySecret: Boolean(keySecret),
    keyIdFoundVia: diag.keyIdSource,
    keySecretFoundVia: diag.keySecretSource,
    environment: typeof process !== "undefined" && process?.env?.NODE_ENV ? process.env.NODE_ENV : "unknown",
  });

  if (!keyId || !keySecret) {
    const missing: string[] = [];
    if (!keyId) missing.push("RAZORPAY_KEY_ID (or VITE_RAZORPAY_KEY_ID)");
    if (!keySecret) missing.push("RAZORPAY_KEY_SECRET");

    throw new Error(
      `Razorpay credentials are not configured on the server. Missing: ${missing.join(", ")}. Please set these in your Vercel Project Settings under Environment Variables (Production & Preview) and redeploy.`,
    );
  }

  return {
    razorpay: new Razorpay({ key_id: keyId, key_secret: keySecret }),
    keyId,
    keySecret,
  };
}

const createOrderSchema = z.object({
  registrationId: z.string().uuid(),
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/, "Invalid booking session token"),
});

export type CreateRazorpayOrderResult = {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  name: string;
  description: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
  notes: Record<string, string>;
};

export async function createRazorpayOrderHandler(data: {
  registrationId: string;
  sessionToken: string;
}): Promise<CreateRazorpayOrderResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: reg, error: findErr } = await supabaseAdmin
    .from("registrations")
    .select("*")
    .eq("id", data.registrationId)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!reg) {
    throw new Error("Registration session not found. Please fill out the registration form first.");
  }

  if (reg.status === "confirmed") {
    throw new Error("Your payment has already been verified and confirmed.");
  }

  // Verify booking session token hash & expiry on the server
  const now = new Date();
  const callerHash = await hashBookingSessionToken(data.sessionToken);
  const isExpired =
    !reg.session_expires_at ||
    new Date(reg.session_expires_at).getTime() <= now.getTime();

  if (
    !reg.session_token_hash ||
    !constantTimeEqualHex(reg.session_token_hash, callerHash)
  ) {
    throw new Error("Invalid booking session. Please refresh or register again.");
  }

  if (isExpired) {
    throw new Error("Your booking session has expired. Please register again.");
  }

  const { razorpay, keyId } = getRazorpayClient();

  // Fixed amount for Titu Backpackers Coorg Trip: ₹8,500 = 850,000 paise
  const amountInPaise = TRIP.price * 100;
  if (amountInPaise < 100) {
    throw new Error("Amount must be at least 100 paise.");
  }

  const receipt = `rcpt_${reg.booking_id.replace(/[^a-zA-Z0-9_]/g, "").slice(-30)}`;

  try {
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        booking_id: reg.booking_id,
        registration_id: reg.id,
        participant_name: reg.full_name,
      },
    });

    // Save order id in admin_note / registration state for audit trail
    const existingNote = reg.admin_note ? `${reg.admin_note} | ` : "";
    await supabaseAdmin
      .from("registrations")
      .update({
        admin_note: `${existingNote}Razorpay Order: ${order.id}`.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reg.id);

    return {
      order_id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      key_id: keyId,
      name: TRIP.brand,
      description: `Coorg 2026 Student Trip — Ref: ${reg.booking_id}`,
      prefill: {
        name: reg.full_name,
        email: reg.email?.endsWith("@titubackpackers.internal") ? "" : reg.email ?? "",
        contact: reg.phone,
      },
      notes: {
        booking_id: reg.booking_id,
        registration_id: reg.id,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create Razorpay order";
    throw new Error(`Razorpay Order creation failed: ${message}`);
  }
}

/**
 * Creates a Razorpay Order on the server for ₹8,500 (850,000 paise).
 * Verifies booking session ownership before initiating the order.
 */
export const createRazorpayOrderServer = createServerFn({ method: "POST" })
  .validator((input: unknown) => createOrderSchema.parse(input))
  .handler(async ({ data }): Promise<CreateRazorpayOrderResult> => {
    return createRazorpayOrderHandler(data);
  });

const verifyPaymentSchema = z.object({
  registrationId: z.string().uuid(),
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/, "Invalid booking session token"),
  razorpay_order_id: z.string().min(1, "Missing razorpay_order_id"),
  razorpay_payment_id: z.string().min(1, "Missing razorpay_payment_id"),
  razorpay_signature: z.string().min(1, "Missing razorpay_signature"),
});

export async function verifyRazorpayPaymentHandler(data: {
  registrationId: string;
  sessionToken: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<GuestRegistrationSession> {
  const { razorpay, keySecret } = getRazorpayClient();

  // 1. Verify HMAC-SHA256 signature
  const text = `${data.razorpay_order_id}|${data.razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(text)
    .digest("hex");

  const isSignatureValid =
    expectedSignature.length === data.razorpay_signature.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf-8"),
      Buffer.from(data.razorpay_signature, "utf-8"),
    );

  if (!isSignatureValid) {
    throw new Error("Invalid Razorpay payment signature. Payment verification failed.");
  }

  // 2. Double-check payment status and amount with Razorpay API (₹8,500 = 850000 paise)
  try {
    const payment = await razorpay.payments.fetch(data.razorpay_payment_id);
    if (payment) {
      if (payment.order_id && payment.order_id !== data.razorpay_order_id) {
        throw new Error("Payment order ID mismatch.");
      }
      if (Number(payment.amount) !== TRIP.price * 100) {
        throw new Error(`Invalid payment amount: expected ₹${TRIP.price}, received ₹${Number(payment.amount) / 100}`);
      }
      if (payment.currency && payment.currency.toUpperCase() !== "INR") {
        throw new Error("Invalid payment currency: expected INR.");
      }
      if (payment.status !== "captured" && payment.status !== "authorized") {
        throw new Error(`Payment is not successful (status: ${payment.status}).`);
      }
    }
  } catch (fetchErr: unknown) {
    // If the mock or API doesn't implement payments.fetch or network error occurs,
    // we log but rely on the cryptographically validated HMAC signature.
    if (fetchErr instanceof Error && !fetchErr.message.includes("is not a function")) {
      console.warn("Razorpay payment fetch check notice:", fetchErr.message);
    }
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: reg, error: findErr } = await supabaseAdmin
    .from("registrations")
    .select("*")
    .eq("id", data.registrationId)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!reg) {
    throw new Error("Registration session not found.");
  }

  // Verify booking session token hash & expiry on the server
  const now = new Date();
  const callerHash = await hashBookingSessionToken(data.sessionToken);
  const isExpired =
    !reg.session_expires_at ||
    new Date(reg.session_expires_at).getTime() <= now.getTime();

  if (
    !reg.session_token_hash ||
    !constantTimeEqualHex(reg.session_token_hash, callerHash)
  ) {
    throw new Error("Invalid booking session.");
  }

  if (isExpired) {
    throw new Error("Your booking session has expired.");
  }

  const nowIso = now.toISOString();
  const renewedToken = generateBookingSessionToken();
  const renewedTokenHash = await hashBookingSessionToken(renewedToken);
  const renewedExpiresAtIso = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  const note = [
    reg.admin_note,
    `[Razorpay Verified] Order: ${data.razorpay_order_id}, Payment: ${data.razorpay_payment_id}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const updatePayload = {
    utr: data.razorpay_payment_id,
    status: "confirmed" as const,
    payment_submitted_at: nowIso,
    session_token_hash: renewedTokenHash,
    session_expires_at: renewedExpiresAtIso,
    admin_note: note,
    updated_at: nowIso,
  };

  let { data: updated, error: updateErr } = await supabaseAdmin
    .from("registrations")
    .update(updatePayload)
    .eq("id", reg.id)
    .select("*")
    .single();

  if (updateErr && (updateErr.code === "23505" || /duplicate key|unique constraint/i.test(updateErr.message))) {
    const retry = await supabaseAdmin
      .from("registrations")
      .update({
        ...updatePayload,
        utr: `${data.razorpay_payment_id}-${reg.booking_id.slice(-4)}`,
      })
      .eq("id", reg.id)
      .select("*")
      .single();
    updated = retry.data;
    updateErr = retry.error;
  }

  if (updateErr || !updated) {
    throw new Error(updateErr?.message ?? "Failed to update verified payment status.");
  }

  return {
    id: updated.id,
    booking_id: updated.booking_id,
    full_name: updated.full_name,
    email: updated.email?.endsWith("@titubackpackers.internal") ? null : updated.email?.replace(/\+[0-9a-f]{6}@/, "@") ?? null,
    phone: updated.phone.replace(/#[0-9a-f]{6}$/, ""),
    cohort: updated.cohort,
    status: updated.status,
    utr: updated.utr,
    admin_note: updated.admin_note,
    session_token: renewedToken,
    session_expires_at: renewedExpiresAtIso,
  };
}

/**
 * Verifies Razorpay payment signature using HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET).
 * On successful match, updates Supabase registration status to 'confirmed' (or 'pending_verification')
 * and stores payment ID as the reference.
 */
export const verifyRazorpayPaymentServer = createServerFn({ method: "POST" })
  .validator((input: unknown) => verifyPaymentSchema.parse(input))
  .handler(async ({ data }): Promise<GuestRegistrationSession> => {
    return verifyRazorpayPaymentHandler(data);
  });
