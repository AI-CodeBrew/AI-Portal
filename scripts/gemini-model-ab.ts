/**
 * Compare Gemini models for WhatsApp sales tool-calling.
 * Run: node --env-file=.env.local --experimental-strip-types scripts/gemini-model-ab.ts
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
] as const;

const SYSTEM_PROMPT = `You are a WhatsApp sales assistant for a store.
Rules:
- Use browse_catalog when customer wants to see products without naming one.
- Use search_products when they name a product, ask price, or give SKU.
- Use create_draft_order when they share phone + delivery address to buy.
- NEVER use search_products for price objections ("too expensive", "no thanks").
- Keep replies short (2-4 lines) when not calling a tool.
- Price objections: reply with empathy/offer, do not search catalog.`;

const TOOLS = [
  {
    name: "browse_catalog",
    description:
      "Show 2 products when customer wants to browse without naming a product.",
    parameters: {
      type: "object",
      properties: {
        more: { type: "boolean" },
      },
    },
  },
  {
    name: "search_products",
    description: "Search by product name, keyword, or SKU.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "create_draft_order",
    description: "Create order when customer shares phone + address.",
    parameters: {
      type: "object",
      properties: {
        line_items: { type: "array" },
        phone: { type: "string" },
        address1: { type: "string" },
        city: { type: "string" },
      },
      required: ["line_items", "phone", "address1", "city"],
    },
  },
];

type Scenario = {
  id: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  user: string;
  expectTool?: string;
  forbidTools?: string[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "browse",
    history: [],
    user: "show me products",
    expectTool: "browse_catalog",
  },
  {
    id: "browse_more",
    history: [
      {
        role: "assistant",
        content:
          "Here are 2 products:\nAquaShelf — Rs 2,500\nAudionic ENC — Rs 1,200\n\nSay more for other options.",
      },
    ],
    user: "more",
    expectTool: "browse_catalog",
  },
  {
    id: "named_product",
    history: [],
    user: "i want Audionic ENC",
    expectTool: "search_products",
  },
  {
    id: "objection",
    history: [
      {
        role: "assistant",
        content:
          "[Ref: abc]\nAudionic ENC — Rs 1,200\n\nWhich size/color do you need?",
      },
      { role: "user", content: "yellow" },
      {
        role: "assistant",
        content: "Perfect — share your phone & delivery address.",
      },
    ],
    user: "but they are too expensive",
    forbidTools: ["search_products"],
  },
  {
    id: "variant_color",
    history: [
      {
        role: "assistant",
        content:
          "[Ref: abc]\nAudionic ENC — Rs 1,200\nOptions: Color: Yellow, Black\n\nWhich size/color do you need?",
      },
    ],
    user: "yellow",
    forbidTools: ["search_products"],
  },
  {
    id: "checkout",
    history: [
      {
        role: "assistant",
        content:
          "[Ref: abc]\nAudionic ENC — Rs 1,200\n\nWant it? Share your phone & delivery address.",
      },
    ],
    user: "phone 03211234567 address house 12 gulberg lahore",
    expectTool: "create_draft_order",
  },
  {
    id: "greeting",
    history: [],
    user: "hello",
    forbidTools: ["search_products", "browse_catalog"],
  },
  {
    id: "sku",
    history: [],
    user: "do you have AA-BT-ENC01",
    expectTool: "search_products",
  },
];

type RunResult = {
  model: string;
  scenario: string;
  ok: boolean;
  ms: number;
  tools: string[];
  error?: string;
};

async function runScenario(
  apiKey: string,
  model: string,
  scenario: Scenario
): Promise<RunResult> {
  const history = [...scenario.history, { role: "user" as const, content: scenario.user }];
  const contents = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const start = Date.now();
  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          tools: [{ functionDeclarations: TOOLS }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { temperature: 0.35, maxOutputTokens: 512 },
        }),
      }
    );

    const ms = Date.now() - start;
    if (!res.ok) {
      const err = await res.text();
      return {
        model,
        scenario: scenario.id,
        ok: false,
        ms,
        tools: [],
        error: `${res.status}: ${err.slice(0, 120)}`,
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<
            | { text?: string }
            | { functionCall?: { name?: string } }
          >;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const tools = parts
      .map((p) =>
        "functionCall" in p && p.functionCall?.name
          ? p.functionCall.name
          : null
      )
      .filter((n): n is string => Boolean(n));

    let ok = true;
    if (scenario.expectTool && !tools.includes(scenario.expectTool)) ok = false;
    if (scenario.forbidTools?.some((f) => tools.includes(f))) ok = false;
    if (
      scenario.forbidTools &&
      !scenario.expectTool &&
      tools.length > 0 &&
      scenario.forbidTools.length === 2 &&
      tools.some((t) => scenario.forbidTools!.includes(t))
    ) {
      ok = false;
    }
    if (scenario.id === "greeting" && tools.length > 0) ok = false;

    return { model, scenario: scenario.id, ok, ms, tools };
  } catch (err) {
    return {
      model,
      scenario: scenario.id,
      ok: false,
      ms: Date.now() - start,
      tools: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error("Set GEMINI_API_KEY in .env.local");
    process.exit(1);
  }

  console.log("Gemini model A/B — WhatsApp sales tool calling\n");
  const results: RunResult[] = [];

  for (const model of MODELS) {
    console.log(`Testing ${model}...`);
    for (const scenario of SCENARIOS) {
      const result = await runScenario(apiKey, model, scenario);
      results.push(result);
      const mark = result.ok ? "PASS" : "FAIL";
      const toolStr = result.tools.length ? result.tools.join(",") : "text";
      const err = result.error ? ` (${result.error})` : "";
      console.log(`  ${mark} ${scenario.id} [${toolStr}] ${result.ms}ms${err}`);
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log("");
  }

  const summary = MODELS.map((model) => {
    const rows = results.filter((r) => r.model === model && !r.error?.includes("404"));
    const available = rows.length > 0;
    const passed = rows.filter((r) => r.ok).length;
    const total = rows.length;
    const avgMs =
      total > 0
        ? Math.round(rows.reduce((s, r) => s + r.ms, 0) / total)
        : 0;
    const unavailable = results.some(
      (r) => r.model === model && r.error?.includes("404")
    );
    return { model, available: available && !unavailable, passed, total, avgMs };
  });

  console.log("=== SUMMARY ===");
  for (const s of summary) {
    if (!s.available) {
      console.log(`${s.model}: not available on your API key`);
      continue;
    }
    console.log(
      `${s.model}: ${s.passed}/${s.total} passed, avg ${s.avgMs}ms`
    );
  }

  const ranked = summary
    .filter((s) => s.available && s.total > 0)
    .sort((a, b) => {
      if (b.passed !== a.passed) return b.passed - a.passed;
      return a.avgMs - b.avgMs;
    });

  if (ranked.length === 0) {
    console.log("\nNo models available. Use gemini-3-flash-preview in Admin.");
    process.exit(1);
  }

  const winner = ranked[0]!;
  console.log(`\n>>> USE: ${winner.model}`);
  console.log(
    "Set in Admin → AI Defaults → LLM Provider → Gemini model field."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
