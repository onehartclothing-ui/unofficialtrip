import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import Razorpay from "razorpay";
import { TRIP } from "@/lib/trip";

export const APIRoute = createAPIFileRoute("/api/razorpay-webhook")({
  POST: async ({ request }) => {
    try {
      const webhookSecret =
        (typeof process !== "undefined" && process.env
          ? process.env["RAZORPAY_WEBHOOK_SECRET"] ||
            process.env["RAZORPAY_KEY_SECRET"] ||
            process.env["TITU_RAZORPAY_KEY_SECRET"]
          : "") || "";

      if (!webhookSecret) {
        return json({ error: "Webhook secret not configured" }, { status: 500 });
      }

      const rawBody = await request.text();
      const signature = request.headers.get("x-razorpay-signature");

      if (!signature) {
        return json({ error: "Missing x-razorpay-signature header" }, { status: 400 });
      }

      const isValid = Razorpay.validateWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        return json({ error: "Invalid webhook signature" }, { status: 400 });
      }

      const event = JSON.parse(rawBody);

      if (event.event === "payment.captured" || event.event === "order.paid") {
        const paymentEntity = event.payload?.payment?.entity;
        const notes = paymentEntity?.notes || event.payload?.order?.entity?.notes || {};
        const registrationId = notes.registration_id;
        const paymentId = paymentEntity?.id;
        const orderId = paymentEntity?.order_id;
        const amount = paymentEntity?.amount;

        if (registrationId && paymentId && (!amount || Number(amount) === TRIP.price * 100)) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("registrations")
            .update({
              utr: paymentId,
              status: "confirmed",
              payment_submitted_at: new Date().toISOString(),
              admin_note: `[Razorpay Webhook Confirmed] Event: ${event.event}, Order: ${orderId}, Payment: ${paymentId}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", registrationId);
        }
      }

      return json({ status: "ok" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Webhook processing failed";
      return json({ error: message }, { status: 500 });
    }
  },
});
