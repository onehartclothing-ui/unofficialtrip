import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/site/PageShell";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Coorg 2026 | Titu Backpackers" },
      { name: "description", content: "Answers about the Coorg 2026 student trip: dates, price, payment and Casino Night." },
      { property: "og:title", content: "FAQ — Coorg 2026" },
      { property: "og:description", content: "Dates, price, payment and Casino Night — answered." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Faq,
});

const QA = [
  ["When is the trip?", "20–22 November 2026, in Coorg."],
  ["How much does it cost?", "₹8,500 per person, paid in full during registration."],
  ["Is this an official Mesa trip?", "No. It's an unofficial, student-organized trip by Titu Backpackers. It is not organized or endorsed by Mesa School of Business."],
  ["Who can register?", "Mesa School of Business students. You'll verify your email before paying."],
  ["How do I pay?", "Via UPI to gatepay.nkgsbank725538@icici. Then submit your UTR / transaction ID and a payment screenshot on the registration page."],
  ["When is my spot confirmed?", "Only after an organizer manually verifies your payment was received. You'll see “Confirmed” on your registration page and can download your confirmation."],
  ["What is Casino Night?", "A casual social card-game evening. No real-money betting, no stakes, no prizes — just a game night with friends."],
  ["Can I get a refund?", "Payments are non-refundable for voluntary participant cancellations, subject to applicable law. See the Terms."],
  ["Where's the full plan?", "We're keeping details for the group. For questions, DM @titubagpackers on Instagram."],
];

function Faq() {
  return (
    <PageShell>
      <h1 className="font-display text-7xl md:text-9xl">FAQ.</h1>
      <div className="mt-10 divide-y divide-border border-y border-border">
        {QA.map(([q, a]) => (
          <details key={q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
              {q}<span className="text-ember transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-bone/80">{a}</p>
          </details>
        ))}
      </div>
    </PageShell>
  );
}
