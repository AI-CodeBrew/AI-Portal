/**
 * Canonical app URL for OAuth redirects, webhooks, and integration UI.
 * Set NEXT_PUBLIC_APP_URL on Vercel to your production domain (recommended).
 */
export function getAppUrl(requestUrl?: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL || process.env.SHOPIFY_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (requestUrl) return new URL(requestUrl).origin;

  return "http://localhost:3000";
}
