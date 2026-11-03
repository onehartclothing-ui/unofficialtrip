import { json } from "@tanstack/react-start";
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { z } from "zod";
import Razorpay from "razorpay";
import { TRIP } from "@/lib/trip";

const bodySchema = z.object({
  amount: z.number().int().min(100).optional(),
  currency: z.string().default("INR"),
  receipt: z.string().optional(),
  registrationId: z.string().uuid().optional(),
});

export const APIRoute = createAPIFileRoute("/api/create-order")({
  POST: async ({ request }) => {
    try {
      const keyId =
        process.env["RAZORPAY_KEY_ID"] ||
        process.env["VITE_RAZORPAY_KEY_ID"] ||
        "";
      const keySecret = process.env["RAZORPAY_KEY_SECRET"] || "";

      if (!keyId || !keySecret) {
        return json(
          { error: "Razorpay credentials not configured on server" },
          { status: 401 },
        );
      }

      const body = await request.json().catch(() => ({}));
      const parsed = bodySchema.safeParse(body);
      if (!parsed.success) {
        return json(
          { error: "Invalid request body", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const amount = parsed.data.amount ?? TRIP.price * 100;
      if (amount < 100) {
        return json(
          { error: "Minimum order amount is 100 paise" },
          { status: 400 },
        );
      }

      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const receipt =
        parsed.data.receipt ??
        `rcpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

      const order = await razorpay.orders.create({
        amount,
        currency: parsed.data.currency,
        receipt,
        notes: parsed.data.registrationId
          ? { registration_id: parsed.data.registrationId }
          : undefined,
      });

      return json({
        order_id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        key_id: keyId,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create order";
      return json({ error: message }, { status: 500 });
    }
  },
});
