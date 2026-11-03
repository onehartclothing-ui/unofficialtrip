import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TRIP, COHORT_OPTIONS, validateEmail, normalizeIndianPhone } from "@/lib/trip";

/**
 * Session TTL for completing UPI payment after submitting or resuming a registration (7 days, renewed on every verified visit).
 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const REGISTRATION_EXISTS_CODE = "REGISTRATION_EXISTS" as const;

export type GuestRegistrationSession = {
  id: string;
  booking_id: string;
  full_name: string;
  email: string;
  phone: string;
  cohort: string | null;
  status: string;
  utr: string | null;
  admin_note?: string | null;
  session_token: string;
  session_expires_at: string;
};

/**
 * Generates a cryptographically secure, unguessable 256-bit (32-byte / 64-hex-char) booking session token.
 */
export function generateBookingSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes the SHA-256 hex digest of a booking session token so raw tokens are never stored in the database.
 */
export async function hashBookingSessionToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time string comparison for SHA-256 hex hashes.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const createGuestRegSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().max(255),
  phone: z.string().trim().min(10).max(20),
  cohort: z.string().trim().min(1, "Please select your cohort").max(100),
  registrationId: z.string().uuid().optional(),
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

export const createGuestRegistrationServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createGuestRegSchema.parse(input))
  .handler(async ({ data }): Promise<GuestRegistrationSession> => {
    const emailRes = validateEmail(data.email);
    if (!emailRes.valid) {
      throw new Error(emailRes.error ?? "Please enter a valid email address");
    }

    const phoneRes = normalizeIndianPhone(data.phone);
    if (!phoneRes.valid) {
      throw new Error(phoneRes.error ?? "Please enter a valid 10-digit Indian mobile number");
    }

    if (!(COHORT_OPTIONS as readonly string[]).includes(data.cohort)) {
      throw new Error("Please select a valid cohort");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const nowIso = now.toISOString();
    const newToken = generateBookingSessionToken();
    const newTokenHash = await hashBookingSessionToken(newToken);
    const expiresAtIso = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

    // 1. If the caller already has an active session in this browser (e.g. went back from payment to edit details),
    //    verify ownership via their registrationId + sessionToken first so they can freely edit their name, email, phone, or cohort.
    if (data.registrationId && data.sessionToken) {
      const { data: ownReg, error: ownErr } = await supabaseAdmin
        .from("registrations")
        .select("*")
        .eq("id", data.registrationId)
        .maybeSingle();

      if (ownErr) throw new Error(ownErr.message);

      if (ownReg) {
        const callerHash = await hashBookingSessionToken(data.sessionToken);
        const isExpired =
          !ownReg.session_expires_at ||
          new Date(ownReg.session_expires_at).getTime() <= now.getTime();

        if (
          ownReg.session_token_hash &&
          !isExpired &&
          constantTimeEqualHex(ownReg.session_token_hash, callerHash) &&
          ownReg.status !== "pending_verification" &&
          ownReg.status !== "confirmed"
        ) {
          // Ensure their edited email or phone does not collide with a DIFFERENT registration record
          const { data: conflicts, error: conflictErr } = await supabaseAdmin
            .from("registrations")
            .select("id, booking_id, status")
            .or(`email.eq.${emailRes.email},phone.eq.${phoneRes.phone}`)
            .neq("id", ownReg.id);

          if (conflictErr) throw new Error(conflictErr.message);

          if (conflicts && conflicts.length > 0) {
            throw new Error(
              "REGISTRATION_EXISTS: An active or completed registration already exists with this email or phone number. Please use 'Already Registered? Continue Your Booking' to verify your email and resume your booking.",
            );
          }

          const { data: updated, error: updateErr } = await supabaseAdmin
            .from("registrations")
            .update({
              full_name: data.fullName,
              email: emailRes.email,
              phone: phoneRes.phone,
              cohort: data.cohort,
              session_token_hash: newTokenHash,
              session_expires_at: expiresAtIso,
              terms_accepted_at: nowIso,
              refund_ack_accepted_at: nowIso,
              policy_version: TRIP.policyVersion,
              updated_at: nowIso,
            })
            .eq("id", ownReg.id)
            .select("*")
            .single();

          if (updateErr) throw new Error(updateErr.message);

          return {
            id: updated.id,
            booking_id: updated.booking_id,
            full_name: updated.full_name,
            email: updated.email,
            phone: updated.phone,
            cohort: updated.cohort,
            status: updated.status,
            utr: updated.utr,
            admin_note: updated.admin_note,
            session_token: newToken,
            session_expires_at: expiresAtIso,
          };
        }
      }
    }

    // 2. Otherwise check if an existing registration matches this email or phone
    const { data: existingList, error: findErr } = await supabaseAdmin
      .from("registrations")
      .select("*")
      .or(`email.eq.${emailRes.email},phone.eq.${phoneRes.phone}`);

    if (findErr) {
      throw new Error(findErr.message);
    }

    if (existingList && existingList.length > 0) {
      // NEVER allow an unauthenticated caller to modify an existing registration
      // unless they prove ownership with the active, unexpired session_token.
      if (!data.sessionToken || existingList.length > 1) {
        throw new Error(
          "REGISTRATION_EXISTS: This email or phone number is already registered. Please use 'Already Registered? Continue Your Booking' to verify your email and continue from where you left off.",
        );
      }

      const existing = existingList[0]!;
      if (existing.status === "pending_verification" || existing.status === "confirmed") {
        throw new Error(
          `REGISTRATION_EXISTS: Payment has already been submitted for this registration (Ref: ${existing.booking_id}). Please use 'Already Registered? Continue Your Booking' to check your status.`,
        );
      }

      const callerHash = await hashBookingSessionToken(data.sessionToken);
      const isExpired =
        !existing.session_expires_at ||
        new Date(existing.session_expires_at).getTime() <= now.getTime();

      if (
        !existing.session_token_hash ||
        isExpired ||
        !constantTimeEqualHex(existing.session_token_hash, callerHash)
      ) {
        throw new Error(
          "REGISTRATION_EXISTS: This email or phone number is already registered. Please use 'Already Registered? Continue Your Booking' to verify your email and continue your booking.",
        );
      }

      // Caller holds the valid, unexpired session token for this exact registration -> allow updating their own draft
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("registrations")
        .update({
          full_name: data.fullName,
          email: emailRes.email,
          phone: phoneRes.phone,
          cohort: data.cohort,
          session_token_hash: newTokenHash,
          session_expires_at: expiresAtIso,
          terms_accepted_at: nowIso,
          refund_ack_accepted_at: nowIso,
          policy_version: TRIP.policyVersion,
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateErr) {
        throw new Error(updateErr.message);
      }

      return {
        id: updated.id,
        booking_id: updated.booking_id,
        full_name: updated.full_name,
        email: updated.email,
        phone: updated.phone,
        cohort: updated.cohort,
        status: updated.status,
        utr: updated.utr,
        admin_note: updated.admin_note,
        session_token: newToken,
        session_expires_at: expiresAtIso,
      };
    }

    const guestUserId = crypto.randomUUID();

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("registrations")
      .insert({
        user_id: guestUserId,
        full_name: data.fullName,
        email: emailRes.email,
        phone: phoneRes.phone,
        cohort: data.cohort,
        status: "registration_started",
        session_token_hash: newTokenHash,
        session_expires_at: expiresAtIso,
        terms_accepted_at: nowIso,
        refund_ack_accepted_at: nowIso,
        policy_version: TRIP.policyVersion,
      })
      .select("*")
      .single();

    if (insertErr) {
      throw new Error(insertErr.message);
    }

    return {
      id: inserted.id,
      booking_id: inserted.booking_id,
      full_name: inserted.full_name,
      email: inserted.email,
      phone: inserted.phone,
      cohort: inserted.cohort,
      status: inserted.status,
      utr: inserted.utr,
      admin_note: inserted.admin_note,
      session_token: newToken,
      session_expires_at: expiresAtIso,
    };
  });

const verifyGuestSessionSchema = z.object({
  registrationId: z.string().uuid(),
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Verifies an existing guest booking session on the server (e.g. when reopening or refreshing the website)
 * and renews the session expiry so active bookings are not invalidated across visits.
 */
export const getGuestRegistrationSessionServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => verifyGuestSessionSchema.parse(input))
  .handler(async ({ data }): Promise<GuestRegistrationSession | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reg, error } = await supabaseAdmin
      .from("registrations")
      .select("*")
      .eq("id", data.registrationId)
      .maybeSingle();

    if (error || !reg) return null;

    const now = new Date();
    const callerHash = await hashBookingSessionToken(data.sessionToken);
    const isExpired =
      !reg.session_expires_at ||
      new Date(reg.session_expires_at).getTime() <= now.getTime();

    if (
      !reg.session_token_hash ||
      isExpired ||
      !constantTimeEqualHex(reg.session_token_hash, callerHash)
    ) {
      return null;
    }

    // Renew session expiry on verified visit so active bookings stay valid
    const renewedExpiresAtIso = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    await supabaseAdmin
      .from("registrations")
      .update({ session_expires_at: renewedExpiresAtIso })
      .eq("id", reg.id);

    return {
      id: reg.id,
      booking_id: reg.booking_id,
      full_name: reg.full_name,
      email: reg.email,
      phone: reg.phone,
      cohort: reg.cohort,
      status: reg.status,
      utr: reg.utr,
      admin_note: reg.admin_note,
      session_token: data.sessionToken,
      session_expires_at: renewedExpiresAtIso,
    };
  });

const checkRegistrationEmailSchema = z.object({
  email: z.string().trim().max(255),
});

/**
 * Checks whether a registration exists for the given email without leaking any PII or booking details,
 * and ensures a pre-confirmed Supabase Auth user exists for that email so `supabase.auth.signInWithOtp`
 * always uses the Magic Link / OTP Login template instead of the first-time "Confirm your signup" template.
 */
export const checkRegistrationEmailExistsServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => checkRegistrationEmailSchema.parse(input))
  .handler(async ({ data }): Promise<{ exists: boolean }> => {
    const emailRes = validateEmail(data.email);
    if (!emailRes.valid) {
      throw new Error(emailRes.error ?? "Please enter a valid email address");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reg, error } = await supabaseAdmin
      .from("registrations")
      .select("id")
      .eq("email", emailRes.email)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!reg) {
      return { exists: false };
    }

    // Ensure the returning student has a pre-confirmed auth.users entry so Supabase Auth
    // sends the Login OTP / Magic Link email rather than the "Confirm your signup" email.
    try {
      const { error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailRes.email,
        email_confirm: true,
      });

      if (createAuthErr && /already|exists|registered/i.test(createAuthErr.message)) {
        // User already exists in auth.users; ensure their email_confirm is true in case a previous unconfirmed signup occurred
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const existingAuthUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === emailRes.email,
        );
        if (existingAuthUser && !existingAuthUser.email_confirmed_at) {
          await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
            email_confirm: true,
          });
        }
      }
    } catch {
      // Non-fatal: client signInWithOtp will still proceed
    }

    return { exists: true };
  });

const resumeRegistrationByVerifiedEmailSchema = z.object({
  accessToken: z.string().min(10, "Missing verification token"),
});

/**
 * Securely resumes an existing registration after a returning student verifies ownership of their email
 * via Supabase Auth (OTP or magic link). Verifies the Supabase Auth JWT on the server, matches the
 * verified email to `public.registrations`, and issues a fresh renewable booking session token.
 * Never allows access using an unverified email or phone number.
 */
export const resumeRegistrationByVerifiedEmailServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => resumeRegistrationByVerifiedEmailSchema.parse(input))
  .handler(async ({ data }): Promise<GuestRegistrationSession> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(
      data.accessToken,
    );

    if (authErr || !userData?.user?.email) {
      throw new Error("Could not verify your email session. Please request a new verification code.");
    }

    const verifiedEmail = userData.user.email.trim().toLowerCase();

    const { data: reg, error: findErr } = await supabaseAdmin
      .from("registrations")
      .select("*")
      .eq("email", verifiedEmail)
      .maybeSingle();

    if (findErr) {
      throw new Error(findErr.message);
    }

    if (!reg) {
      throw new Error(
        "No existing registration was found for this email. Please switch to 'New Student — Register' to create your booking.",
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const newToken = generateBookingSessionToken();
    const newTokenHash = await hashBookingSessionToken(newToken);
    const expiresAtIso = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update({
        session_token_hash: newTokenHash,
        session_expires_at: expiresAtIso,
        updated_at: nowIso,
      })
      .eq("id", reg.id)
      .select("*")
      .single();

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    return {
      id: updated.id,
      booking_id: updated.booking_id,
      full_name: updated.full_name,
      email: updated.email,
      phone: updated.phone,
      cohort: updated.cohort,
      status: updated.status,
      utr: updated.utr,
      admin_note: updated.admin_note,
      session_token: newToken,
      session_expires_at: expiresAtIso,
    };
  });

const submitGuestPaymentSchema = z.object({
  registrationId: z.string().uuid(),
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/, "Invalid booking session token"),
  utr: z.string().trim().min(8).max(30),
  fileBase64: z.string().min(1, "Please upload your payment screenshot"),
  fileType: z.string().min(1),
  fileExt: z.string().min(1).max(10),
});

export const submitGuestPaymentServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitGuestPaymentSchema.parse(input))
  .handler(async ({ data }): Promise<GuestRegistrationSession> => {
    const cleanUtr = data.utr.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{8,30}$/.test(cleanUtr)) {
      throw new Error("Please enter a valid UTR / UPI Transaction ID (8–30 alphanumeric characters)");
    }

    if (!ALLOWED_IMAGE_MIMES.has(data.fileType)) {
      throw new Error("Screenshot must be a valid image (JPEG, PNG, WebP, or HEIC)");
    }

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

    if (reg.status === "pending_verification" || reg.status === "confirmed") {
      throw new Error("Payment has already been submitted for this registration.");
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
      throw new Error("Invalid booking session. Please verify your email under 'Already Registered? Continue Your Booking' to resume.");
    }

    if (isExpired) {
      throw new Error("Your booking session has expired. Please verify your email under 'Already Registered? Continue Your Booking' to continue.");
    }

    // Check duplicate UTR
    const { data: dupUtr } = await supabaseAdmin
      .from("registrations")
      .select("id")
      .eq("utr", cleanUtr)
      .neq("id", reg.id)
      .maybeSingle();

    if (dupUtr) {
      throw new Error("This UTR / Transaction ID has already been submitted");
    }

    // Decode and validate screenshot on the server before uploading to private storage
    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.byteLength === 0) {
      throw new Error("Uploaded screenshot file is empty");
    }
    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new Error("Screenshot must be under 5 MB");
    }

    const ext = data.fileExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const finalPath = `${reg.user_id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("payment-screenshots")
      .upload(finalPath, buffer, { contentType: data.fileType, upsert: false });

    if (uploadErr) {
      throw new Error(uploadErr.message);
    }

    const nowIso = now.toISOString();
    const renewedToken = generateBookingSessionToken();
    const renewedTokenHash = await hashBookingSessionToken(renewedToken);
    const renewedExpiresAtIso = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

    // Rotate and keep a valid session token so the student can revisit and check their status anytime
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update({
        utr: cleanUtr,
        screenshot_path: finalPath,
        session_token_hash: renewedTokenHash,
        session_expires_at: renewedExpiresAtIso,
        terms_accepted_at: reg.terms_accepted_at ?? nowIso,
        refund_ack_accepted_at: reg.refund_ack_accepted_at ?? nowIso,
        policy_version: TRIP.policyVersion,
        payment_submitted_at: nowIso,
        status: "pending_verification",
        updated_at: nowIso,
      })
      .eq("id", reg.id)
      .select("*")
      .single();

    if (updateErr) throw new Error(updateErr.message);

    return {
      id: updated.id,
      booking_id: updated.booking_id,
      full_name: updated.full_name,
      email: updated.email,
      phone: updated.phone,
      cohort: updated.cohort,
      status: updated.status,
      utr: updated.utr,
      admin_note: updated.admin_note,
      session_token: renewedToken,
      session_expires_at: renewedExpiresAtIso,
    };
  });
