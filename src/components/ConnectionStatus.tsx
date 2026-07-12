interface StepProps {
  done: boolean;
  active?: boolean;
  label: string;
  detail?: string;
}

function Step({ done, active, label, detail }: StepProps) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-blue-600 text-white"
              : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? "✓" : active ? "→" : "·"}
      </div>
      <div>
        <p
          className={`text-sm font-medium ${
            done ? "text-emerald-800" : active ? "text-blue-800" : "text-slate-600"
          }`}
        >
          {label}
        </p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

export function ShopifyConnectionSteps({
  hasCredentials,
  isConnected,
  shopDomain,
  appUrl,
}: {
  hasCredentials: boolean;
  isConnected: boolean;
  shopDomain?: string | null;
  appUrl: string;
}) {
  const base = appUrl.replace(/\/$/, "");
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <Step
        done={hasCredentials}
        active={!hasCredentials}
        label="Whitelist URLs in Shopify Partners, then save credentials"
        detail={`App URL: ${base} · Redirect URL: ${base}/auth/shopify/callback · then paste API key, secret, and shop domain here`}
      />
      <Step
        done={isConnected}
        active={hasCredentials && !isConnected}
        label="Authorize with Shopify"
        detail={
          isConnected
            ? `Connected to ${shopDomain}`
            : "Click Connect — you'll be redirected to Shopify"
        }
      />
      <Step
        done={isConnected}
        label="Orders sync automatically"
        detail="New Shopify orders appear on the Orders page"
      />
    </div>
  );
}

export function WhatsAppConnectionSteps({
  platformReady,
  isConnected,
  phoneLabel,
}: {
  platformReady: boolean;
  isConnected: boolean;
  phoneLabel?: string | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <Step
        done={platformReady}
        active={!platformReady}
        label="Platform WhatsApp ready"
        detail={
          platformReady
            ? "Arabia AI Meta app is configured"
            : "Waiting for admin to finish WhatsApp Platform Setup"
        }
      />
      <Step
        done={isConnected}
        active={platformReady && !isConnected}
        label="Connect your WhatsApp number"
        detail={
          isConnected
            ? phoneLabel
              ? `Connected · ${phoneLabel}`
              : "Connected"
            : "Takes about 2 minutes with Meta Embedded Signup"
        }
      />
      <Step
        done={isConnected}
        label="Receive messages & order updates"
        detail="Customers can chat and get confirmation messages"
      />
    </div>
  );
}

export function ConnectionBadge({
  connected,
  label,
}: {
  connected: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        connected
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-900"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          connected ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      {label}
    </span>
  );
}
