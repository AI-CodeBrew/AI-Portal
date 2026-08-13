import type { Metadata } from "next";
import Link from "next/link";
import { ArabiaAILogo } from "@/components/ArabiaAILogo";

export const metadata: Metadata = {
  title: "Terms of Service — Arabia AI",
  description: "Terms of Service for the Arabia AI Commerce Portal.",
};

const UPDATED = "August 13, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Arabia AI home">
            <ArabiaAILogo size="sm" variant="light" />
          </Link>
          <Link
            href="/privacy"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Privacy Policy
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Legal
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-landing-display)] text-4xl font-medium tracking-tight text-slate-900">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {UPDATED}</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-slate-700">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">1. Service</h2>
            <p>
              Arabia AI provides a commerce portal that helps merchants connect
              Shopify stores and WhatsApp Business accounts, manage inbox and
              orders, and use AI-assisted customer messaging. By creating an
              account or using the Service at{" "}
              <a
                className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                href="https://ai-portal-silk.vercel.app"
              >
                https://ai-portal-silk.vercel.app
              </a>
              , you agree to these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              2. Accounts &amp; acceptable use
            </h2>
            <p>
              You must provide accurate account information and keep credentials
              secure. You may only use the Service for lawful business purposes
              and must comply with Meta, WhatsApp, and Shopify policies when
              connecting those platforms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              3. Third-party platforms
            </h2>
            <p>
              WhatsApp / Meta and Shopify are separate services. Your use of
              those platforms is governed by their terms. Arabia AI is not
              responsible for outages, policy enforcement, or account actions
              taken by Meta or Shopify.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              4. Data &amp; privacy
            </h2>
            <p>
              Our{" "}
              <Link
                href="/privacy"
                className="font-medium text-emerald-700 underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                href="/data-deletion"
                className="font-medium text-emerald-700 underline-offset-2 hover:underline"
              >
                User Data Deletion
              </Link>{" "}
              instructions explain how we handle personal data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              5. Disclaimer
            </h2>
            <p>
              The Service is provided “as is.” To the fullest extent permitted
              by law, we disclaim warranties of merchantability, fitness for a
              particular purpose, and non-infringement. We are not liable for
              indirect or consequential damages arising from use of the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">6. Contact</h2>
            <p>
              Questions about these Terms: use Support in the dashboard or email
              the platform operator for your Arabia AI account.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-5 text-xs text-slate-500 sm:flex-row sm:px-8">
          <p>© {new Date().getFullYear()} Arabia AI</p>
          <div className="flex gap-4 font-medium text-slate-600">
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy Policy
            </Link>
            <Link href="/data-deletion" className="hover:text-slate-900">
              Data deletion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
