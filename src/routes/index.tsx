import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from "motion/react";
import { useRef } from "react";
import { FloatingNav } from "@/components/site/FloatingNav";
import sky from "@/assets/sky-ranges.jpg";
import road from "@/assets/mountain-road.jpg";
import hills from "@/assets/mid-hills.webp";
import viewpoint from "@/assets/viewpoint.jpg";
import poker from "@/assets/poker-table.jpg";
import sunrise from "@/assets/sunrise.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Coorg 2026 — Titu Backpackers | Scroll your way to Coorg" },
      { name: "description", content: "An unofficial Mesa getaway to Coorg, 20–22 November 2026. ₹8,500 per person. Mountains, mist and Casino Night." },
      { property: "og:title", content: "Coorg 2026 — Titu Backpackers" },
      { property: "og:description", content: "Three days out of the usual. 20–22 Nov 2026 · ₹8,500 / person." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Line({ p, range, children, className = "" }: { p: MotionValue<number>; range: [number, number, number, number]; children: React.ReactNode; className?: string }) {
  const opacity = useTransform(p, range, [0, 1, 1, 0]);
  const y = useTransform(p, [range[0], range[1]], [40, 0]);
  const blur = useTransform(p, [range[0], range[1]], ["blur(10px)", "blur(0px)"]);
  return <motion.div style={{ opacity, y, filter: blur }} className={className}>{children}</motion.div>;
}

function Climb() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const k = reduce ? 0 : 1;

  const skyScale = useTransform(p, [0, 1], [1.05, 1 + 0.35 * k]);
  const skyY = useTransform(p, [0, 1], ["0%", `${-8 * k}%`]);
  const heroOpacity = useTransform(p, [0, 0.12], [1, 0]);
  const heroY = useTransform(p, [0, 0.15], [0, -120 * k]);
  const roadOpacity = useTransform(p, [0.12, 0.28, 0.85, 1], [0, 1, 1, 0]);
  const roadScale = useTransform(p, [0.12, 1], [1.1, 1 + 0.9 * k]);
  const hillsY = useTransform(p, [0, 0.4, 1], ["55%", "25%", `${-30 * k}%`]);
  const hillsScale = useTransform(p, [0, 1], [1, 1 + 0.5 * k]);
  const fogX1 = useTransform(p, [0, 1], ["-20%", "30%"]);
  const fogX2 = useTransform(p, [0, 1], ["25%", "-35%"]);
  const fogOpacity = useTransform(p, [0, 0.5, 1], [0.5, 0.9, 0.6]);
  const tint = useTransform(p, [0, 1], [0.15, 0.55]);
  const progressW = useTransform(p, [0, 1], ["0%", "100%"]);

  return (
    <section ref={ref} id="experience" className="relative h-[420vh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <motion.img src={sky} alt="Misty mountain ranges of Coorg at dawn" width={1920} height={1088} fetchPriority="high"
          style={{ scale: skyScale, y: skyY }} className="absolute inset-0 h-full w-full object-cover will-change-transform" />
        <motion.img src={road} alt="A winding road climbing through Coorg's forest" width={1920} height={1088}
          style={{ opacity: roadOpacity, scale: roadScale }} className="absolute inset-0 h-full w-full object-cover will-change-transform" />
        <motion.img src={hills} alt="" aria-hidden width={1600} height={907}
          style={{ y: hillsY, scale: hillsScale, opacity: useTransform(p, [0, 0.15, 0.3], [1, 1, 0]) }}
          className="absolute inset-x-0 bottom-0 h-full w-full object-cover object-bottom will-change-transform" />
        <motion.div style={{ x: fogX1, opacity: fogOpacity }} className="fog absolute inset-y-0 -left-1/4 w-[150%]" />
        <motion.div style={{ x: fogX2, opacity: fogOpacity }} className="fog absolute inset-y-[20%] -left-1/4 w-[150%]" />
        <motion.div style={{ opacity: tint }} className="absolute inset-0 bg-ink" />
        <div className="veil absolute inset-0" />

        {/* Scene 1 */}
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="absolute inset-0 flex flex-col justify-end px-5 pb-28 md:px-12 md:pb-20">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 1 }} className="eyebrow mb-4 text-bone/80">
            An unofficial Mesa getaway
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 60, letterSpacing: "0.2em" }} animate={{ opacity: 1, y: 0, letterSpacing: "-0.01em" }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-[28vw] text-bone md:text-[19vw]">
            Coorg<span className="text-ember">.</span>
          </motion.h1>
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 1 }} className="font-display text-3xl md:text-5xl">
              20 — 22 November 2026
            </motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 1 }} className="text-lg italic text-bone/80">
              "Three days out of the usual."
            </motion.p>
          </div>
          <div className="eyebrow animate-nudge mt-10 text-center text-bone/70">Scroll to escape ↓</div>
        </motion.div>

        {/* Scene 2 text */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 text-center">
          <div className="relative w-full">
            <Line p={p} range={[0.18, 0.24, 0.34, 0.4]} className="absolute inset-x-0 -translate-y-1/2">
              <p className="font-display text-5xl md:text-8xl">The group chat…</p>
            </Line>
            <Line p={p} range={[0.4, 0.46, 0.56, 0.62]} className="absolute inset-x-0 -translate-y-1/2">
              <p className="font-display text-5xl md:text-8xl">Actually made it <span className="text-ember">out.</span></p>
            </Line>
            <Line p={p} range={[0.64, 0.7, 0.86, 0.94]} className="absolute inset-x-0 -translate-y-1/2">
              <p className="font-display text-6xl md:text-9xl">Three days.</p>
              <p className="eyebrow mt-6 text-bone/80">One good escape.</p>
            </Line>
          </div>
        </div>

        <div className="absolute left-5 top-1/2 hidden h-40 w-px -translate-y-1/2 bg-bone/20 md:block">
          <motion.div style={{ height: progressW }} className="w-px bg-ember" />
        </div>
      </div>
    </section>
  );
}

function Viewpoint() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const scale = useTransform(p, [0, 1], [1.25, 1]);
  const fog = useTransform(p, [0, 0.35], [1, 0]);
  const tint = useTransform(p, [0.8, 1], [0, 0.85]);
  return (
    <section ref={ref} className="relative h-[300vh]">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <motion.img src={viewpoint} alt="Viewpoint above a sea of clouds in Coorg" loading="lazy" width={1920} height={1088}
          style={{ scale }} className="absolute inset-0 h-full w-full object-cover" />
        <motion.div style={{ opacity: fog }} className="absolute inset-0 bg-mist" />
        <div className="veil absolute inset-0" />
        <div className="absolute inset-0 flex flex-col justify-center px-5 md:px-12">
          <Line p={p} range={[0.15, 0.25, 0.9, 1]}><h2 className="font-display text-[17vw] md:text-[11vw]">Good places.</h2></Line>
          <Line p={p} range={[0.3, 0.4, 0.9, 1]}><h2 className="font-display text-[17vw] text-bone/70 md:ml-[12vw] md:text-[11vw]">Better company.</h2></Line>
          <Line p={p} range={[0.48, 0.58, 0.9, 1]} className="mt-8 flex flex-wrap gap-x-8 gap-y-2">
            <span className="font-display text-2xl md:text-4xl">20–22 November.</span>
            <span className="font-display text-2xl md:text-4xl">Coorg.</span>
            <span className="font-display text-2xl text-ember md:text-4xl">₹8,500 / person.</span>
          </Line>
        </div>
        <motion.div style={{ opacity: tint }} className="absolute inset-0 bg-ink" />
      </div>
    </section>
  );
}

const CARDS = [
  { r: "A", s: "♠", red: false, x: -38, rot: -18 },
  { r: "K", s: "♥", red: true, x: -12, rot: -6 },
  { r: "Q", s: "♣", red: false, x: 14, rot: 6 },
  { r: "J", s: "♦", red: true, x: 40, rot: 18 },
];

function PlayingCard({ p, c, i }: { p: MotionValue<number>; c: (typeof CARDS)[number]; i: number }) {
  const x = useTransform(p, [0.1, 0.5], ["0%", `${c.x * 2.4}%`]);
  const rotate = useTransform(p, [0.1, 0.5], [0, c.rot]);
  const rotateX = useTransform(p, [0, 0.5, 1], [55, 20, 10]);
  const y = useTransform(p, [0, 0.5], [120, -i * 4]);
  return (
    <motion.div style={{ x, rotate, rotateX, y }}
      className="absolute left-1/2 top-1/2 -ml-[52px] -mt-[74px] flex h-[148px] w-[104px] flex-col justify-between rounded-lg bg-bone p-2.5 shadow-2xl md:-ml-[70px] md:-mt-[100px] md:h-[200px] md:w-[140px]">
      <span className={`font-display text-2xl md:text-3xl ${c.red ? "text-ember" : "text-ink"}`}>{c.r}{c.s}</span>
      <span className={`self-center text-5xl md:text-6xl ${c.red ? "text-ember" : "text-ink"}`}>{c.s}</span>
      <span className={`rotate-180 font-display text-2xl md:text-3xl ${c.red ? "text-ember" : "text-ink"}`}>{c.r}{c.s}</span>
    </motion.div>
  );
}

function CasinoNight() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const bg = useTransform(p, [0, 0.3], [0, 0.55]);
  const scale = useTransform(p, [0, 1], [1.15, 1]);
  const out = useTransform(p, [0.85, 1], [0, 1]);
  return (
    <section ref={ref} className="relative h-[280vh] bg-ink">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <motion.img src={poker} alt="Cards, chips and chai on a wooden table at a hillside homestay at night" loading="lazy" width={1920} height={1088}
          style={{ opacity: bg, scale }} className="absolute inset-0 h-full w-full object-cover" />
        <div className="amber-glow absolute inset-0" />
        <div className="absolute inset-0 [perspective:900px]">
          <div className="absolute inset-x-0 top-[58%] h-0 md:top-[60%]">
            {CARDS.map((c, i) => <PlayingCard key={c.r} p={p} c={c} i={i} />)}
          </div>
        </div>
        <div className="absolute inset-x-0 top-[12%] px-5 text-center md:top-[10%]">
          <Line p={p} range={[0.05, 0.15, 0.85, 0.95]}>
            <p className="eyebrow text-amber">After dark</p>
            <h2 className="font-display mt-3 text-[20vw] text-amber md:text-[12vw]">Casino Night.</h2>
          </Line>
          <Line p={p} range={[0.3, 0.42, 0.85, 0.95]}>
            <p className="mx-auto mt-2 max-w-md text-lg text-bone/90">Cards on the table. Friends around it. One night worth remembering.</p>
          </Line>
        </div>
        <div className="absolute inset-x-0 bottom-24 text-center md:bottom-12">
          <Line p={p} range={[0.45, 0.55, 0.85, 0.95]}>
            <p className="eyebrow px-5 text-bone/70">No real-money betting — just a social game night.</p>
          </Line>
        </div>
        <motion.div style={{ opacity: out }} className="absolute inset-0 bg-ink" />
      </div>
    </section>
  );
}

function Finale() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden">
      <img src={sunrise} alt="Sunrise over the layered mountains of Coorg" loading="lazy" width={1920} height={1088} className="absolute inset-0 h-full w-full object-cover" />
      <div className="veil absolute inset-0" />
      <div className="relative flex min-h-[100svh] flex-col items-center justify-center px-5 py-28 text-center">
        <motion.h2 initial={{ opacity: 0, scale: 1.15 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} className="font-display text-[22vw] md:text-[14vw]">
          You coming?
        </motion.h2>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.4, duration: 1 }}
          className="mt-6 flex flex-col items-center gap-1">
          <p className="eyebrow">Coorg 2026</p>
          <p className="eyebrow">20–22 November</p>
          <p className="eyebrow">₹8,500 / person</p>
          <Link to="/register" className="mt-10 rounded-full bg-ember px-10 py-5 font-display text-2xl text-ink transition-transform hover:scale-105 md:text-3xl">
            Count me in →
          </Link>
          <p className="mt-6 text-sm text-bone/80">Organized by students. For students.</p>
        </motion.div>
      </div>
      <footer className="relative flex flex-wrap justify-center gap-6 px-5 pb-28 md:pb-10">
        <Link to="/faq" className="eyebrow text-bone/70 hover:text-bone">FAQ</Link>
        <Link to="/terms" className="eyebrow text-bone/70 hover:text-bone">Terms</Link>
        <Link to="/privacy" className="eyebrow text-bone/70 hover:text-bone">Privacy</Link>
        <a href="https://instagram.com/titubagpackers" target="_blank" rel="noreferrer" className="eyebrow text-bone/70 hover:text-bone">@titubagpackers</a>
        <span className="eyebrow w-full text-center text-bone/50">Unofficial student-organized trip · Not an official Mesa event</span>
      </footer>
    </section>
  );
}

function Index() {
  return (
    <div className="grain bg-ink text-bone">
      <FloatingNav />
      <Climb />
      <Viewpoint />
      <CasinoNight />
      <Finale />
    </div>
  );
}
