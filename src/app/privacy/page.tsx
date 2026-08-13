import type { Metadata } from "next";
import Link from "next/link";
import { ArabiaAILogo } from "@/components/ArabiaAILogo";

export const metadata: Metadata = {
  title: "Privacy Policy — Arabia AI",
  description:
    "Privacy Policy for Arabia AI, including WhatsApp Business API and Shopify data practices.",
};

const UPDATED = "July 12, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Arabia AI home">
            <ArabiaAILogo size="sm" variant="light" />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Legal
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-landing-display)] text-4xl font-medium tracking-tight text-slate-900">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: {UPDATED}</p>

        <div className="prose-privacy mt-10 space-y-8 text-[15px] leading-relaxed text-slate-700">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              1. Who we are
            </h2>
            <p>
              Arabia AI (“we”, “us”, or “our”) operates the Arabia AI Commerce
              Portal (the “Service”), available at{" "}
              <a
                className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                href="https://ai-portal-silk.vercel.app"
              >
                https://ai-portal-silk.vercel.app
              </a>
              . The Service helps merchants connect Shopify stores and WhatsApp
              Business accounts so they can manage conversations, orders, and
              AI-assisted customer replies.
            </p>
            <p>
              This Privacy Policy explains what information we collect, how we
              use it, and your choices. By using the Service, you agree to this
              Policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              2. Information we collect
            </h2>
            <p>Depending on how you use Arabia AI, we may collect:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Account information</strong> — name, email address, and
                authentication credentials when you sign up as a reseller or
                admin.
              </li>
              <li>
                <strong>Business / store information</strong> — store name, shop
                domain, plan details, and integration settings you configure.
              </li>
              <li>
                <strong>Shopify data</strong> — product catalog details, order
                information, customer contact details associated with orders,
                fulfillment/tracking data, and related metadata needed to sync
                and confirm orders (when you connect Shopify).
              </li>
              <li>
                <strong>WhatsApp / Meta data</strong> — WhatsApp Business phone
                number identifiers, message content (inbound and outbound),
                delivery metadata, template usage, and connection tokens
                required to send and receive messages via the WhatsApp Business
                Platform / Cloud API (when you connect WhatsApp).
              </li>
              <li>
                <strong>Customer conversation data</strong> — messages exchanged
                between end customers and your business through WhatsApp, stored
                so you and (when enabled) our AI agent can reply and keep chat
                history in your inbox.
              </li>
              <li>
                <strong>Usage and technical data</strong> — logs related to
                webhooks, API calls, AI usage quotas, IP/device information
                typical of web services, and security/diagnostic events.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              3. How we use information
            </h2>
            <p>We use the information above to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide, operate, and improve the Service</li>
              <li>
                Connect your Shopify and WhatsApp integrations and keep them in
                sync
              </li>
              <li>
                Deliver AI-assisted replies, order confirmation, tracking, and
                related automation you enable
              </li>
              <li>Show you inbox, orders, products, and dashboard analytics</li>
              <li>Process billing, plans, and support requests</li>
              <li>
                Maintain security, prevent abuse, and comply with law and
                platform policies (including Meta and Shopify requirements)
              </li>
            </ul>
            <p>
              We do <strong>not</strong> sell personal information. We do not
              use WhatsApp customer message content to train public AI models
              for unrelated third parties.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              4. WhatsApp Business Platform / Meta
            </h2>
            <p>
              When you connect WhatsApp through Arabia AI, message processing
              relies on Meta’s WhatsApp Business Platform. Message data is used
              only to provide the messaging, inbox, AI reply, and order
              notification features you request.
            </p>
            <p>
              We process WhatsApp data in accordance with Meta’s terms and
              policies applicable to WhatsApp Business Solution Providers /
              tech providers. You (the merchant) remain responsible for having a
              lawful basis to message your customers and for complying with
              WhatsApp / Meta commerce and messaging policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              5. Sharing of information
            </h2>
            <p>We may share information with:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Service providers</strong> that host or power the
                Service (for example cloud hosting, database, AI inference
                providers, and payment processors), under contracts that limit
                use of data to providing services to us
              </li>
              <li>
                <strong>Meta / WhatsApp</strong> and <strong>Shopify</strong> as
                needed to operate the integrations you connect
              </li>
              <li>
                <strong>Authorities</strong> when required by law or to protect
                rights, safety, and security
              </li>
            </ul>
            <p>
              If the Service is transferred as part of a merger, acquisition, or
              asset sale, information may be transferred subject to this Policy
              or a successor policy with notice where required.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              6. Data retention
            </h2>
            <p>
              We retain account, conversation, and order-related data for as
              long as your account is active and as needed to provide the
              Service, resolve disputes, enforce agreements, and meet legal
              obligations. You may request deletion of your account data by
              contacting us; we will delete or anonymize personal data unless we
              must retain it for legal or legitimate business reasons.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              7. Security
            </h2>
            <p>
              We use reasonable technical and organizational measures to protect
              data, including encrypted storage of sensitive integration secrets
              (such as API tokens) and access controls. No method of
              transmission or storage is 100% secure; we cannot guarantee
              absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              8. Your choices and rights
            </h2>
            <p>
              Depending on your location, you may have rights to access,
              correct, export, or delete personal information, or to object to
              certain processing. Merchants can manage integrations (including
              disconnecting Shopify or WhatsApp) from the Service. End customers
              should contact the merchant they messaged for requests about
              conversations with that business; we will assist merchants where
              appropriate.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              9. Children’s privacy
            </h2>
            <p>
              The Service is intended for businesses and adults. We do not
              knowingly collect personal information from children under 13 (or
              the minimum age required in your jurisdiction).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              10. International transfers
            </h2>
            <p>
              We may process and store information in countries other than where
              you are located. Where required, we take steps to protect
              transfers consistent with applicable law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              11. Changes to this Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will post
              the updated version on this page and revise the “Last updated”
              date. Continued use of the Service after changes means you accept
              the updated Policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">
              12. Contact us
            </h2>
            <p>
              For privacy questions or requests, contact us through the{" "}
              <strong>Support</strong> chat in your Arabia AI dashboard, or
              email the platform operator associated with your Arabia AI
              account.
            </p>
            <p>
              Service URL:{" "}
              <a
                className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                href="https://ai-portal-silk.vercel.app"
              >
                https://ai-portal-silk.vercel.app
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-5 text-xs text-slate-500 sm:flex-row sm:px-8">
          <p>© {new Date().getFullYear()} Arabia AI</p>
          <div className="flex gap-4 font-medium text-slate-600">
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/data-deletion" className="hover:text-slate-900">
              Data deletion
            </Link>
            <Link href="/login" className="hover:text-slate-900">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
