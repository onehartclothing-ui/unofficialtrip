import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TRIP, validateEmail, normalizeIndianPhone } from "@/lib/trip";

export type GuestRegistrationSession = {
  id: string;
  user_id: string;
  booking_id: string;
  full_name: string;
  email: string;
  phone: string;
  cohort: string | null;
  status: string;
  utr: string | null;
};

const createGuestRegSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().max(255),
  phone: z.string().trim().min(10).max(20),
  cohort: z.string().trim().min(1, "Please select your cohort").max(100),
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

    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!serviceRoleKey) {
      throw new Error("Server service role key not configured");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if an existing registration matches this email or phone
    const { data: existingList, error: findErr } = await supabaseAdmin
      .from("registrations")
      .select("*")
      .or(`email.eq.${emailRes.email},phone.eq.${phoneRes.phone}`);

    if (findErr) {
      throw new Error(findErr.message);
    }

    if (existingList && existingList.length > 0) {
      const submitted = existingList.find((r) => r.status === "pending_verification" || r.status === "confirmed");
      if (submitted) {
        throw new Error(
          `A registration with this email or phone number has already submitted payment (Ref: ${submitted.booking_id}).`,
        );
      }

      if (existingList.length > 1) {
        throw new Error("Email or phone number is already registered with another booking.");
      }

      const existing = existingList[0]!;
      const now = new Date().toISOString();

      // Update with cohort; if the cohort column hasn't been migrated yet, fall back cleanly
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("registrations")
        .update({
          full_name: data.fullName,
          email: emailRes.email,
          phone: phoneRes.phone,
          cohort: data.cohort,
          terms_accepted_at: now,
          refund_ack_accepted_at: now,
          policy_version: TRIP.policyVersion,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateErr) {
        if (updateErr.message.includes("cohort")) {
          const { data: fallbackUpdated, error: fallbackErr } = await supabaseAdmin
            .from("registrations")
            .update({
              full_name: data.fullName,
              email: emailRes.email,
              phone: phoneRes.phone,
              terms_accepted_at: now,
              refund_ack_accepted_at: now,
              policy_version: TRIP.policyVersion,
              updated_at: now,
            })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (fallbackErr) throw new Error(fallbackErr.message);
          return {
            id: fallbackUpdated.id,
            user_id: fallbackUpdated.user_id,
            booking_id: fallbackUpdated.booking_id,
            full_name: fallbackUpdated.full_name,
            email: fallbackUpdated.email,
            phone: fallbackUpdated.phone,
            cohort: data.cohort,
            status: fallbackUpdated.status,
            utr: fallbackUpdated.utr,
          };
        }
        throw new Error(updateErr.message);
      }

      return {
        id: updated.id,
        user_id: updated.user_id,
        booking_id: updated.booking_id,
        full_name: updated.full_name,
        email: updated.email,
        phone: updated.phone,
        cohort: updated.cohort ?? data.cohort,
        status: updated.status,
        utr: updated.utr,
      };
    }

    const now = new Date().toISOString();
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
        terms_accepted_at: now,
        refund_ack_accepted_at: now,
        policy_version: TRIP.policyVersion,
      })
      .select("*")
      .single();

    if (insertErr) {
      if (insertErr.message.includes("cohort")) {
        const { data: fallbackInserted, error: fallbackInsertErr } = await supabaseAdmin
          .from("registrations")
          .insert({
            user_id: guestUserId,
            full_name: data.fullName,
            email: emailRes.email,
            phone: phoneRes.phone,
            status: "registration_started",
            terms_accepted_at: now,
            refund_ack_accepted_at: now,
            policy_version: TRIP.policyVersion,
          })
          .select("*")
          .single();
        if (fallbackInsertErr) throw new Error(fallbackInsertErr.message);
        return {
          id: fallbackInserted.id,
          user_id: fallbackInserted.user_id,
          booking_id: fallbackInserted.booking_id,
          full_name: fallbackInserted.full_name,
          email: fallbackInserted.email,
          phone: fallbackInserted.phone,
          cohort: data.cohort,
          status: fallbackInserted.status,
          utr: fallbackInserted.utr,
        };
      }
      throw new Error(insertErr.message);
    }

    return {
      id: inserted.id,
      user_id: inserted.user_id,
      booking_id: inserted.booking_id,
      full_name: inserted.full_name,
      email: inserted.email,
      phone: inserted.phone,
      cohort: inserted.cohort ?? data.cohort,
      status: inserted.status,
      utr: inserted.utr,
    };
  });

const submitGuestPaymentSchema = z.object({
  registrationId: z.string().uuid(),
  userId: z.string().uuid(),
  utr: z.string().trim().min(8).max(30),
  fileBase64: z.string().optional(),
  fileType: z.string().optional(),
  fileExt: z.string().optional(),
  screenshotPath: z.string().optional(),
});

export const submitGuestPaymentServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitGuestPaymentSchema.parse(input))
  .handler(async ({ data }): Promise<GuestRegistrationSession> => {
    const cleanUtr = data.utr.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{8,30}$/.test(cleanUtr)) {
      throw new Error("Please enter a valid UTR / UPI Transaction ID (8–30 alphanumeric characters)");
    }

    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!serviceRoleKey) {
      throw new Error("Server service role key not configured");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reg, error: findErr } = await supabaseAdmin
      .from("registrations")
      .select("*")
      .eq("id", data.registrationId)
      .eq("user_id", data.userId)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);
    if (!reg) {
      throw new Error("Registration session not found. Please fill out the registration form first.");
    }

    if (reg.status === "pending_verification" || reg.status === "confirmed") {
      throw new Error("Payment has already been submitted for this registration.");
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

    let finalPath = data.screenshotPath;
    if (!finalPath && data.fileBase64) {
      const ext = (data.fileExt ?? "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
      const contentType = data.fileType && data.fileType.startsWith("image/") ? data.fileType : "image/jpeg";
      finalPath = `${reg.user_id}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(data.fileBase64, "base64");
      if (buffer.byteLength > 5 * 1024 * 1024) {
        throw new Error("Screenshot must be under 5 MB");
      }
      const { error: uploadErr } = await supabaseAdmin.storage
        .from("payment-screenshots")
        .upload(finalPath, buffer, { contentType, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);
    }

    if (!finalPath || finalPath.split("/")[0] !== reg.user_id) {
      throw new Error("Please upload your payment screenshot");
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update({
        utr: cleanUtr,
        screenshot_path: finalPath,
        terms_accepted_at: reg.terms_accepted_at ?? now,
        refund_ack_accepted_at: reg.refund_ack_accepted_at ?? now,
        policy_version: TRIP.policyVersion,
        payment_submitted_at: now,
        status: "pending_verification",
        updated_at: now,
      })
      .eq("id", reg.id)
      .select("*")
      .single();

    if (updateErr) throw new Error(updateErr.message);

    return {
      id: updated.id,
      user_id: updated.user_id,
      booking_id: updated.booking_id,
      full_name: updated.full_name,
      email: updated.email,
      phone: updated.phone,
      cohort: updated.cohort,
      status: updated.status,
      utr: updated.utr,
    };
  });

