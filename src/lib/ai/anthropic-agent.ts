import Anthropic from "@anthropic-ai/sdk";
import {
  executeSalesTool,
  anthropicToolDefinitions,
  type AgentContext,
} from "./sales-tools";
import { buildSalesSystemPromptWithExamples } from "./build-system-prompt-with-examples";
import { CHAT_HISTORY_LIMIT, trimHistoryForAgent } from "./chat-history";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function toolFormattedReply(result: unknown): string | null {
  if (result && typeof result === "object" && "formatted_reply" in result) {
    const text = (result as { formatted_reply?: string }).formatted_reply?.trim();
    return text || null;
  }
  return null;
}

export async function runSalesAgentWithAnthropic(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const storeLabel = ctx.store.store_name || ctx.store.shop_domain || "our store";

  const historyLimit =
    ctx.aiConfig?.effectiveChatHistoryLimit ?? CHAT_HISTORY_LIMIT;
  const trimmedHistory = trimHistoryForAgent(history, historyLimit);
  const agentCtx: AgentContext = { ...ctx, chatHistory: trimmedHistory };

  const messages: Anthropic.MessageParam[] = trimmedHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const systemPrompt = await buildSalesSystemPromptWithExamples({
    storeId: ctx.store.id,
    storeLabel,
    storeCurrency: ctx.storeCurrency,
    aiConfig: ctx.aiConfig,
    adProductContext: ctx.adProductContext,
    pendingOrdersHint: ctx.pendingOrdersHint,
    history: trimmedHistory,
    memoryContext: ctx.memoryContext,
  });

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  const rawTools = anthropicToolDefinitions();
  const toolDefs: Anthropic.Tool[] = rawTools.map((tool, i) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
    ...(i === rawTools.length - 1
      ? { cache_control: { type: "ephemeral" as const } }
      : {}),
  }));

  let iterations = 0;
  const maxIterations = 8;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemBlocks,
      tools: toolDefs,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "Thanks for your message!";
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text || "Thanks for your message!";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolUses) {
      const input = tool.input as Record<string, unknown>;
      const executed = await executeSalesTool(tool.name, input, agentCtx);
      if (executed.escalated) {
        return "Got it — someone from our team will message you shortly 👍";
      }

      const formatted = toolFormattedReply(executed.result);
      if (tool.name === "browse_catalog" && formatted) {
        return formatted;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: JSON.stringify(executed.result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "Thanks for your patience — a team member will follow up shortly.";
}
