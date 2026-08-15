/**
 * Fast routing tests (no Gemini). Run:
 *   npx tsx --tsconfig tsconfig.json scripts/test-shop-routing.ts
 */
import { resolveExactDirectRoute } from "../src/lib/ai/exact-routes.ts";
import {
  looksLikeCheckoutMessage,
  looksLikeBuyActiveProductIntent,
  isProductPitchFresh,
} from "../src/lib/ai/checkout-parse.ts";
import {
  looksLikeCatalogBrowseRequest,
  looksLikeCatalogBrowseMoreRequest,
  looksLikeVagueShoppingIntent,
  extractProductSearchQuery,
} from "../src/lib/products/products-service.ts";
import { looksLikeExactNamedProductQuery } from "../src/lib/ai/exact-routes.ts";
import {
  looksLikePitchFollowupQuestion,
  looksLikeProfilePrefsDump,
} from "../src/lib/ai/pitch-followup-reply.ts";

type Hist = Array<{
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}>;

const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
const minutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

const oldPitch: Hist = [
  {
    role: "user",
    content: "pain relief massager",
    created_at: yesterday,
  },
  {
    role: "assistant",
    content:
      "[Ref: 111]\nPAIN RELIEF MASSAGER — Rs. 1999\nIn stock\n\nWant it? Share your phone & delivery address.",
    created_at: yesterday,
  },
];

const returning: Hist = [
  ...oldPitch,
  { role: "user", content: "Heyyyy how are you", created_at: minutesAgo },
];

const sameVisit: Hist = [
  {
    role: "user",
    content: "tell me about PAIN RELIEF MASSAGER",
    created_at: minutesAgo,
  },
  {
    role: "assistant",
    content:
      "[Ref: 111]\nPAIN RELIEF MASSAGER — Rs. 1999\nIn stock\n\nWant it? Share your phone & delivery address.",
    created_at: minutesAgo,
  },
];

let failed = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) console.log(`✅ ${name}`);
  else {
    failed++;
    console.log(`❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const buySomething = "I want to buy something .";
check("vague shopping", looksLikeVagueShoppingIntent(buySomething));
check(
  "buy something is browse or vague",
  looksLikeCatalogBrowseRequest(buySomething) ||
    looksLikeVagueShoppingIntent(buySomething)
);
check(
  "buy something not checkout (returning)",
  !looksLikeCheckoutMessage(buySomething, returning)
);
check(
  "route buy something = catalog_browse",
  resolveExactDirectRoute(buySomething, returning) === "catalog_browse",
  String(resolveExactDirectRoute(buySomething, returning))
);
check(
  "old pitch not fresh after hi",
  !isProductPitchFresh(returning)
);
check("same-visit pitch is fresh", isProductPitchFresh(sameVisit));

const elseMsg = "No i want to buy something else";
check("something else is more-browse", looksLikeCatalogBrowseMoreRequest(elseMsg, sameVisit));
check(
  "something else not named search",
  !looksLikeExactNamedProductQuery(elseMsg)
);
check("something else query null", extractProductSearchQuery(elseMsg) == null);
check(
  "route something else = catalog_more",
  resolveExactDirectRoute(elseMsg, sameVisit) === "catalog_more",
  String(resolveExactDirectRoute(elseMsg, sameVisit))
);
check(
  "something else not checkout",
  !looksLikeCheckoutMessage(elseMsg, sameVisit)
);

check(
  "prefs not checkout",
  !looksLikeCheckoutMessage(
    "My name is Ahmed, I live in Dubai, prefer COD, budget under 3500 AED",
    sameVisit
  )
);
check(
  "prefs dump is prefs not COD followup",
  looksLikeProfilePrefsDump(
    "My name is Ahmed, I live in Dubai, prefer COD, budget under 3500 AED"
  ) &&
    !looksLikePitchFollowupQuestion(
      "My name is Ahmed, I live in Dubai, prefer COD, budget under 3500 AED"
    )
);
check(
  "do you do COD is pitch followup",
  looksLikePitchFollowupQuestion("do you do COD?")
);
check(
  "buy it same visit = checkout",
  looksLikeBuyActiveProductIntent("i want to buy it") &&
    resolveExactDirectRoute("i want to buy it", sameVisit) === "checkout",
  String(resolveExactDirectRoute("i want to buy it", sameVisit))
);
check(
  "buy it next day = stale nudge",
  resolveExactDirectRoute("i want to buy it", returning) === "stale_product_nudge",
  String(resolveExactDirectRoute("i want to buy it", returning))
);

const rebuttals: Array<[string, string | null]> = [
  ["too expensive", null],
  ["bohot mehnga hai", null],
  ["not sure about the quality, does it last?", null],
  ["just send me the website link", null],
  ["is this original or copy?", null],
  ["do you do COD?", null],
  ["show me products", "catalog_browse"],
  ["different products", "catalog_more"],
];
check(
  "quality doubt not a search query",
  extractProductSearchQuery("not sure about the quality, does it last?") == null
);
check(
  "website link not a search query",
  extractProductSearchQuery("just send me the website link") == null
);
for (const [msg, expect] of rebuttals) {
  const route = resolveExactDirectRoute(msg, sameVisit);
  if (expect) check(`route ${msg}`, route === expect, String(route));
  else
    check(
      `${msg} not catalog search`,
      route !== "named_product_search" && route !== "sku_search",
      String(route)
    );
}

console.log(failed ? `\nFailed: ${failed}` : "\nAll shop routing checks passed.");
process.exit(failed ? 1 : 0);
