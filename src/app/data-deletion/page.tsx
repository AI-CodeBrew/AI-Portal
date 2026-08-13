import type { Metadata } from "next";
import Link from "next/link";
import { ArabiaAILogo } from "@/components/ArabiaAILogo";

export const metadata: Metadata = {
  title: "User Data Deletion — Arabia AI",
  description:
    "How to request deletion of personal data associated with Arabia AI and Meta Facebook Login.",
};

const UPDATED = "August 13, 2026";
const SUPPORT_EMAIL = "oomerssaeed@gmail.com";

export default function DataDeletionPage() {
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
          User Data Deletion
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {UPDATED}</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-slate-700">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              How to request deletion
            </h2>
            <p>
              If you connected Facebook / WhatsApp through Arabia AI (Arabia Ai
              Portal) and want your personal data deleted, email{" "}
              <a
                className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                href={`mailto:${SUPPORT_EMAIL}?subject=Data%20deletion%20request`}
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              with the subject line <strong>Data deletion request</strong> and
              include:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>The email address used on your Arabia AI account</li>
              <li>Your store name or shop domain (if applicable)</li>
              <li>
                Confirmation that you want account and related integration data
                deleted
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              What we delete
            </h2>
            <p>Within 30 days of a verified request, we will delete or anonymize:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Your Arabia AI account profile data</li>
              <li>
                Stored WhatsApp connection tokens and related phone / WABA
                identifiers for your store
              </li>
              <li>
                Conversation and order records we hold for your store, except
                data we must retain for legal, security, or accounting reasons
              </li>
            </ul>
            <p>
              Merchants can also disconnect Shopify or WhatsApp from{" "}
              <strong>Integrations</strong> in the dashboard at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              Meta / Facebook Login
            </h2>
            <p>
              Removing Facebook Login authorization for Arabia Ai Portal can
              also be done in your Facebook settings under{" "}
              <strong>Settings &amp; privacy → Settings → Apps and
              websites</strong>
              . That revokes Meta access; email us as above if you also want
              data deleted from Arabia AI systems.
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
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
