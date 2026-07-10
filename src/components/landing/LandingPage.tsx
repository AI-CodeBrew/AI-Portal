"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArabiaAILogo } from "@/components/ArabiaAILogo";
import { AI_PLANS, PLAN_ORDER } from "@/lib/ai/plans";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
];

const FEATURES = [
  {
    id: "ai",
    eyebrow: "01 · AI sales agent",
    title: "WhatsApp replies that know your catalog.",
    body: "Arabia AI answers customers with live Shopify products, prices, and chat history — so you only step in when it matters.",
    points: [
      "Product-aware answers from your Shopify store",
      "Custom agent name, opening message, and reply length",
      "Templates for orders and general support",
    ],
  },
  {
    id: "orders",
    eyebrow: "02 · Orders & tracking",
    title: "Confirm orders. Add tracking. Sync to Shopify.",
    body: "See every WhatsApp and Shopify order in one place. Confirm, cancel, and push tracking numbers back to Shopify fulfillment.",
    points: [
      "Unified order list across channels",
      "One-click confirm from the reseller dashboard",
      "Tracking updates sync to Shopify",
    ],
  },
  {
    id: "inbox",
    eyebrow: "03 · One inbox",
    title: "AI handles the chat. You take over when needed.",
    body: "Switch any conversation from AI to manual mode. Your team replies from the same inbox — no lost threads in personal WhatsApp.",
    points: [
      "AI vs manual toggle per conversation",
      "Full message history for every customer",
      "Handoff when a human should reply",
    ],
  },
  {
    id: "ads",
    eyebrow: "04 · Ad WhatsApp links",
    title: "Meta ads that open WhatsApp with product context.",
    body: "Generate WhatsApp links for your Shopify products. When a customer taps the ad, the AI already knows which product they came for.",
    points: [
      "Search products and create ad links in seconds",
      "Ref tags so the AI opens with the right product",
      "Built for Meta / WhatsApp click-to-chat ads",
    ],
  },
];

const STEPS = [
  {
    n: "1",
    title: "Connect Shopify & WhatsApp",
    desc: "Link your store and WhatsApp Business API from Integrations.",
  },
  {
    n: "2",
    title: "Tune your AI agent",
    desc: "Set the agent name, opening message, templates, and reply style.",
  },
  {
    n: "3",
    title: "Sell on autopilot",
    desc: "Customers chat on WhatsApp. AI sells, you confirm orders and ship.",
  },
];

const INTEGRATIONS = ["Shopify", "WhatsApp", "Meta Ads", "Groq AI"];

function DashboardPreview() {
  return (
    <div className="landing-float relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#111827] shadow-2xl shadow-emerald-950/40">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-3 text-xs text-slate-500">Arabia AI · Inbox</span>
      </div>
      <div className="grid grid-cols-[1fr_1.4fr] gap-0">
        <div className="border-r border-white/10 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Conversations
          </p>
          {[
            { phone: "+971 50 ··· 4421", status: "AI", active: true },
            { phone: "+966 55 ··· 1180", status: "You", active: false },
            { phone: "+212 6 ··· 9033", status: "AI", active: false },
          ].map((c) => (
            <div
              key={c.phone}
              className={`mb-1 rounded-lg px-2.5 py-2 ${
                c.active ? "bg-emerald-500/15" : "bg-transparent"
              }`}
            >
              <p className="text-xs font-medium text-slate-200">{c.phone}</p>
              <p
                className={`text-[10px] ${
                  c.status === "You" ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {c.status === "You" ? "Manual" : "AI handling"}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-col p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">+971 50 ··· 4421</p>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              AI on
            </span>
          </div>
          <div className="flex-1 space-y-2">
            <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white/10 px-3 py-2 text-xs text-slate-200">
              Do you have the beige linen shirt in size M?
            </div>
            <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-emerald-600 px-3 py-2 text-xs text-white">
              Yes — Aurora Linen Shirt · Beige, size M is in stock at 289 AED. Want me to place the order?
            </div>
            <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white/10 px-3 py-2 text-xs text-slate-200">
              Yes, cash on delivery please.
            </div>
          </div>
          <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
            <div className="h-7 flex-1 rounded-lg bg-white/5" />
            <div className="h-7 w-16 rounded-lg bg-emerald-600/80" />
          </div>
        </div>
      </div>
      <div className="absolute -right-2 top-16 hidden rounded-xl border border-emerald-500/30 bg-[#0B1120]/95 px-3 py-2 shadow-lg sm:block">
        <p className="text-[10px] font-semibold text-emerald-400">Order created</p>
        <p className="text-xs text-slate-300">#AA-4829 · Pending</p>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-root min-h-screen bg-[#F8FAFC] text-slate-900">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <ArabiaAILogo size="md" variant={scrolled ? "light" : "dark"} />
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  scrolled
                    ? "text-slate-600 hover:text-slate-900"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                scrolled
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-400"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — one composition, brand first */}
      <section className="relative overflow-hidden bg-[#0B1120] pb-20 pt-28 sm:pb-28 sm:pt-32">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 70% 20%, rgba(16,185,129,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 10% 80%, rgba(56,189,248,0.08), transparent 50%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
          }}
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div className="landing-fade-up">
            <p className="font-[family-name:var(--font-landing-display)] text-4xl font-medium tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Arabia AI
            </p>
            <h1 className="mt-4 max-w-xl text-2xl font-semibold leading-snug tracking-tight text-slate-100 sm:text-3xl">
              WhatsApp + Shopify commerce — run by AI, owned by you.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-400">
              Instant product-aware replies, order confirmation, tracking, and
              ad links — one portal for resellers who sell on WhatsApp.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-900/30 transition hover:bg-emerald-400"
              >
                Start free
              </Link>
              <a
                href="#product"
                className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 backdrop-blur transition hover:bg-white/10"
              >
                See product
              </a>
            </div>
            <p className="mt-5 text-xs text-slate-500">
              Connect Shopify & WhatsApp · AI replies from day one · Cancel anytime
            </p>
          </div>

          <div className="landing-fade-up landing-fade-up-delay relative">
            <DashboardPreview />
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-6xl px-5 sm:px-8">
          <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Works with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {INTEGRATIONS.map((name) => (
              <span
                key={name}
                className="text-sm font-medium text-slate-400"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
            Built for WhatsApp sellers
          </p>
          <h2 className="mt-4 font-[family-name:var(--font-landing-display)] text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
            Missed chats and spreadsheet chaos cost you orders every day.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Customers expect instant answers. Copy-pasting products into WhatsApp
            and tracking orders in sheets does not scale. Arabia AI puts sales,
            inbox, and Shopify orders in one place.
          </p>
        </div>
      </section>

      {/* Product features */}
      <section id="product" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl space-y-24 px-5 sm:px-8">
          {FEATURES.map((f, i) => (
            <div
              key={f.id}
              className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
                  {f.eyebrow}
                </p>
                <h3 className="mt-3 font-[family-name:var(--font-landing-display)] text-2xl font-medium tracking-tight text-slate-900 sm:text-3xl">
                  {f.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">
                  {f.body}
                </p>
                <ul className="mt-6 space-y-3">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm text-slate-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <FeatureVisual id={f.id} />
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="scroll-mt-20 border-y border-slate-200 bg-[#0B1120] py-20 sm:py-24"
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
            How it works
          </p>
          <h2 className="mt-3 text-center font-[family-name:var(--font-landing-display)] text-3xl font-medium tracking-tight text-white sm:text-4xl">
            Live in three steps
          </h2>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <span className="font-[family-name:var(--font-landing-display)] text-5xl font-medium text-emerald-500/30">
                  {s.n}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
            Pricing
          </p>
          <h2 className="mt-3 text-center font-[family-name:var(--font-landing-display)] text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
            Plans that match your WhatsApp volume
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-slate-600">
            Each AI reply to a customer message counts as one use. Limits reset
            every month.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLAN_ORDER.map((id) => {
              const plan = AI_PLANS[id];
              const featured = id === "pro";
              return (
                <div
                  key={id}
                  className={`relative flex flex-col rounded-2xl border p-6 ${
                    featured
                      ? "border-emerald-500 bg-emerald-50/50 shadow-lg shadow-emerald-900/5"
                      : "border-slate-200 bg-slate-50/50"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                    {plan.monthlyLimit.toLocaleString()}
                    <span className="text-base font-medium text-slate-500">
                      {" "}
                      replies/mo
                    </span>
                  </p>
                  <p className="mt-3 flex-1 text-sm text-slate-600">
                    {plan.description}
                  </p>
                  <Link
                    href="/signup"
                    className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-semibold transition ${
                      featured
                        ? "bg-emerald-500 text-white hover:bg-emerald-400"
                        : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    Get started
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-[#0B1120] py-20 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(16,185,129,0.2), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-2xl px-5 text-center sm:px-8">
          <h2 className="font-[family-name:var(--font-landing-display)] text-3xl font-medium tracking-tight text-white sm:text-4xl">
            Ready to put WhatsApp sales on autopilot?
          </h2>
          <p className="mt-4 text-base text-slate-400">
            Create your reseller account, connect Shopify and WhatsApp, and let
            Arabia AI handle the first reply.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-900/30 transition hover:bg-emerald-400"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row sm:px-8">
          <ArabiaAILogo size="sm" variant="light" />
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Arabia AI · Commerce Portal
          </p>
          <div className="flex gap-4 text-xs font-medium text-slate-600">
            <Link href="/login" className="hover:text-slate-900">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-slate-900">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureVisual({ id }: { id: string }) {
  if (id === "ai") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-emerald-50/40 p-6 shadow-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
            AI agent
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">Layla</p>
          <p className="mt-1 text-xs text-slate-500">
            Opening: “Hi! I can help you find products and place an order.”
          </p>
          <div className="mt-4 space-y-2">
            <div className="h-2 w-full rounded-full bg-slate-100" />
            <div className="h-2 w-4/5 rounded-full bg-slate-100" />
            <div className="h-2 w-3/5 rounded-full bg-emerald-100" />
          </div>
        </div>
      </div>
    );
  }
  if (id === "orders") {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
          Orders
        </div>
        {[
          { n: "#AA-4829", s: "Confirmed", c: "text-emerald-700 bg-emerald-50" },
          { n: "#AA-4830", s: "Pending", c: "text-amber-800 bg-amber-50" },
          { n: "#AA-4831", s: "Shipped", c: "text-sky-700 bg-sky-50" },
        ].map((o) => (
          <div
            key={o.n}
            className="flex items-center justify-between border-b border-slate-50 px-4 py-3 last:border-0"
          >
            <span className="text-sm font-semibold text-slate-900">{o.n}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.c}`}>
              {o.s}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (id === "inbox") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex gap-2">
          <span className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white">
            AI mode
          </span>
          <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
            Take over manually
          </span>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Switch any chat to manual when a customer needs a human — then flip
          back to AI when you&apos;re done.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0B1120] to-slate-800 p-6 text-white shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
        Ad link
      </p>
      <p className="mt-2 font-mono text-xs text-slate-300 break-all">
        wa.me/9715…?text=Hi%20(ref:%20aurora-linen)
      </p>
      <p className="mt-4 text-sm text-slate-300">
        Customer taps Meta ad → WhatsApp opens → AI knows the product.
      </p>
    </div>
  );
}
