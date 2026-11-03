import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { z } from "zod";
import crypto from "crypto";

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1, "Missing razorpay_order_id"),
  razorpay_payment_id: z.string().min(1, "Missing razorpay_payment_id"),
  razorpay_signature: z.string().min(1, "Missing razorpay_signature"),
  registrationId: z.string().uuid().optional(),
});

export const APIRoute = createAPIFileRoute("/api/verify-payment")({
  POST: async ({ request }) => {
    try {
      const keySecret =
        (typeof process !== "undefined" && process.env
          ? process.env["RAZORPAY_KEY_SECRET"] ||
            process.env["TITU_RAZORPAY_KEY_SECRET"]
          : "") || "";
      if (!keySecret) {
        return json(
          { error: "Razorpay secret not configured on server. Please set RAZORPAY_KEY_SECRET in Vercel." },
          { status: 500 },
        );
      }

      const body = await request.json().catch(() => ({}));
      const parsed = verifySchema.safeParse(body);
      if (!parsed.success) {
        return json(
          { error: "Missing required verification fields", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registrationId } =
        parsed.data;

      const text = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(text)
        .digest("hex");

      const isSignatureValid =
        expectedSignature.length === razorpay_signature.length &&
        crypto.timingSafeEqual(
          Buffer.from(expectedSignature, "utf-8"),
          Buffer.from(razorpay_signature, "utf-8"),
        );

      if (!isSignatureValid) {
        return json(
          { error: "Signature verification failed", success: false },
          { status: 400 },
        );
      }

      // If a registrationId is provided, optionally update Supabase
      if (registrationId) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("registrations")
            .update({
              utr: razorpay_payment_id,
              status: "confirmed",
              payment_submitted_at: new Date().toISOString(),
              admin_note: `[Razorpay Verified via API] Order: ${razorpay_order_id}, Payment: ${razorpay_payment_id}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", registrationId);
        } catch {
          // Keep response intact even if DB update fails
        }
      }

      return json({
        success: true,
        message: "Payment signature verified successfully",
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification error";
      return json({ error: message, success: false }, { status: 500 });
    }
  },
});

