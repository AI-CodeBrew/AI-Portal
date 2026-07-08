import { ArabiaAILogo } from "@/components/ArabiaAILogo";

const FEATURES = [
  "Connect Shopify and WhatsApp Business from one dashboard",
  "AI sales agent answers with products, prices, and chat history",
  "Confirm orders, add tracking, and sync fulfillment to Shopify",
];

export function AuthBrandPanel() {
  return (
    <div className="relative flex min-h-[280px] flex-col bg-[#0B1120] px-8 py-10 text-white lg:min-h-screen lg:px-12 lg:py-12">
      <ArabiaAILogo size="lg" />

      <div className="my-auto max-w-lg py-10 lg:py-0">
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.5rem] lg:leading-[1.15]">
          One inbox. Two channels.
          <br />
          Zero missed orders.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-lg">
          WhatsApp + Shopify order automation, powered by Arabia AI. Customers
          get instant replies — you only step in when it matters.
        </p>

        <ul className="mt-8 space-y-4">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <span
                className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                aria-hidden
              />
              <span className="text-sm leading-relaxed text-slate-300 sm:text-base">
                {feature}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-600">
        © {new Date().getFullYear()} Arabia AI
      </p>
    </div>
  );
}
