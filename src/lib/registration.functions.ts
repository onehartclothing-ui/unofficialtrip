import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TRIP, validateEmail, normalizeIndianPhone } from "@/lib/trip";

/**
 * Session TTL for completing UPI payment after submitting the registration form (7 days, renewed on every visit).
 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GuestRegistrationSession = {
  id: string;
  booking_id: string;
  full_name: string;
  email: string | null;
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
  email: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().min(10).max(20),
  cohort: z.string().trim().max(100).optional().nullable(),
  registrationId: z.string().uuid().optional(),
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});

/**
 * Creates a new guest registration or updates the caller's own active draft (when editing details from the payment page).
 * Allows unlimited registrations using the same email or phone number without requiring OTP or login,
 * and never overwrites or merges existing registrations based only on matching email or phone.
 */
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

    const cohortValue = (data.cohort && data.cohort.trim()) ? data.cohort.trim() : "C2";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const nowIso = now.toISOString();
    const newToken = generateBookingSessionToken();
    const newTokenHash = await hashBookingSessionToken(newToken);
    const expiresAtIso = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

    // 1. If the caller is editing their own active draft from the payment page (verified via registrationId + sessionToken),
    //    update that specific draft registration in place.
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
          const { data: updated, error: updateErr } = await supabaseAdmin
            .from("registrations")
            .update({
              full_name: data.fullName,
              email: emailRes.email ?? `guest_${ownReg.booking_id.toLowerCase().replace(/[^a-z0-9]/g, "")}@titubackpackers.internal`,
              phone: phoneRes.phone,
              cohort: cohortValue,
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

          if (!updateErr && updated) {
            return {
              id: updated.id,
              booking_id: updated.booking_id,
              full_name: updated.full_name,
              email: emailRes.email,
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
    }

    // 2. Create a fresh registration attempt with its own unique booking reference (TB-COORG-XXXXXX).
    //    Never block a student because their email or phone was used before, and never overwrite existing records.
    const guestUserId = crypto.randomUUID();
    const tempTag = generateBookingSessionToken().slice(0, 8);
    // If database column email still has NOT NULL in production before the migration runs,
    // provide an internal synthetic email fallback while keeping actual student email as null in session
    const storedEmail = emailRes.email ?? `guest_${tempTag}@titubackpackers.internal`;

    const basePayload = {
      user_id: guestUserId,
      full_name: data.fullName,
      email: storedEmail,
      phone: phoneRes.phone,
      cohort: cohortValue,
      status: "registration_started" as const,
      session_token_hash: newTokenHash,
      session_expires_at: expiresAtIso,
      terms_accepted_at: nowIso,
      refund_ack_accepted_at: nowIso,
      policy_version: TRIP.policyVersion,
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("registrations")
      .insert(basePayload)
      .select("*")
      .single();

    if (!insertErr && inserted) {
      return {
        id: inserted.id,
        booking_id: inserted.booking_id,
        full_name: inserted.full_name,
        email: emailRes.email,
        phone: inserted.phone,
        cohort: inserted.cohort,
        status: inserted.status,
        utr: inserted.utr,
        admin_note: inserted.admin_note,
        session_token: newToken,
        session_expires_at: expiresAtIso,
      };
    }

    // Fallback: if the database still has legacy UNIQUE constraints (0002 migration not yet run in SQL Editor),
    // preserve existing records intact and insert a distinct registration attempt by tagging the stored key
    // while recording the student's exact contact details in admin_note and returning their clean email/phone to the UI.
    if (insertErr && (insertErr.code === "23505" || /duplicate key|unique constraint/i.test(insertErr.message))) {
      const attemptTag = generateBookingSessionToken().slice(0, 6);
      const [localPart, domainPart] = storedEmail.split("@");
      const fallbackEmail = `${localPart}+${attemptTag}@${domainPart}`;
      const fallbackPhone = `${phoneRes.phone}#${attemptTag}`;

      const { data: fallbackInserted, error: fallbackErr } = await supabaseAdmin
        .from("registrations")
        .insert({
          ...basePayload,
          email: fallbackEmail,
          phone: fallbackPhone,
          cohort: cohortValue,
          admin_note: `Contact: ${emailRes.email ?? "No email"} · ${phoneRes.phone}`,
        })
        .select("*")
        .single();

      if (fallbackErr || !fallbackInserted) {
        throw new Error(fallbackErr?.message ?? insertErr.message);
      }

      return {
        id: fallbackInserted.id,
        booking_id: fallbackInserted.booking_id,
        full_name: fallbackInserted.full_name,
        email: emailRes.email,
        phone: phoneRes.phone,
        cohort: fallbackInserted.cohort,
        status: fallbackInserted.status,
        utr: fallbackInserted.utr,
        admin_note: fallbackInserted.admin_note,
        session_token: newToken,
        session_expires_at: expiresAtIso,
      };
    }

    throw new Error(insertErr?.message ?? "Could not save registration");
  });

const verifyGuestSessionSchema = z.object({
  registrationId: z.string().uuid(),
  sessionToken: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Verifies an existing guest booking session on the server (e.g. when reopening or refreshing the payment page)
 * and renews the session expiry so active bookings remain accessible without requiring login.
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
      email: reg.email?.endsWith("@titubackpackers.internal") ? null : reg.email?.replace(/\+[0-9a-f]{6}@/, "@") ?? null,
      phone: reg.phone.replace(/#[0-9a-f]{6}$/, ""),
      cohort: reg.cohort,
      status: reg.status,
      utr: reg.utr,
      admin_note: reg.admin_note,
      session_token: data.sessionToken,
      session_expires_at: renewedExpiresAtIso,
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

/**
 * Submits UPI payment proof (UTR + screenshot) for a registration attempt.
 * - Never automatically confirms payment; status is set to `pending_verification`.
 * - If the same UTR was already submitted on another registration, flags the submission in `admin_note`
 *   for organizer review rather than counting it as multiple confirmed payments.
 */
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
      throw new Error("Payment proof has already been submitted for this booking.");
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
      throw new Error("Invalid booking session. Please fill out the registration form again.");
    }

    if (isExpired) {
      throw new Error("Your booking session has expired. Please fill out the registration form again.");
    }

    // Check if this UTR has already been submitted on any other registration record
    const { data: dupUtrRows } = await supabaseAdmin
      .from("registrations")
      .select("id, booking_id, status")
      .ilike("utr", `${cleanUtr}%`)
      .neq("id", reg.id);

    const isDuplicateUtr = Boolean(dupUtrRows && dupUtrRows.length > 0);
    const dupRefs = dupUtrRows?.map((r) => r.booking_id).join(", ") ?? "";
    const duplicateFlagNote = isDuplicateUtr
      ? `[DUPLICATE UTR FLAG] UTR ${cleanUtr} was also submitted on booking(s): ${dupRefs}. Verify carefully before approving.`
      : null;

    const combinedAdminNote = [reg.admin_note, duplicateFlagNote]
      .filter(Boolean)
      .join(" | ") || null;

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

    const updatePayload = {
      utr: cleanUtr,
      screenshot_path: finalPath,
      session_token_hash: renewedTokenHash,
      session_expires_at: renewedExpiresAtIso,
      terms_accepted_at: reg.terms_accepted_at ?? nowIso,
      refund_ack_accepted_at: reg.refund_ack_accepted_at ?? nowIso,
      policy_version: TRIP.policyVersion,
      payment_submitted_at: nowIso,
      status: "pending_verification" as const,
      admin_note: combinedAdminNote,
      updated_at: nowIso,
    };

    let { data: updated, error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update(updatePayload)
      .eq("id", reg.id)
      .select("*")
      .single();

    // Fallback if legacy unique constraint on `utr` is still active in DB before 0002 migration is run
    if (updateErr && (updateErr.code === "23505" || /duplicate key|unique constraint/i.test(updateErr.message))) {
      const retry = await supabaseAdmin
        .from("registrations")
        .update({
          ...updatePayload,
          utr: `${cleanUtr}-DUP-${reg.booking_id.slice(-4)}`,
        })
        .eq("id", reg.id)
        .select("*")
        .single();
      updated = retry.data;
      updateErr = retry.error;
    }

    if (updateErr || !updated) {
      throw new Error(updateErr?.message ?? "Failed to submit payment proof");
    }

    return {
      id: updated.id,
      booking_id: updated.booking_id,
      full_name: updated.full_name,
      email: updated.email.replace(/\+[0-9a-f]{6}@/, "@"),
      phone: updated.phone.replace(/#[0-9a-f]{6}$/, ""),
      cohort: updated.cohort,
      status: updated.status,
      utr: cleanUtr,
      admin_note: updated.admin_note,
      session_token: renewedToken,
      session_expires_at: renewedExpiresAtIso,
    };
  });
