import {
  SALES_SYSTEM_PROMPT,
  OPENAI_SALES_TOOLS,
  executeSalesTool,
  type AgentContext,
} from "./sales-tools";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: "tool";
      tool_call_id: string;
      name: string;
      content: string;
    };

interface GroqResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
}

async function groqChat(messages: ChatMessage[]): Promise<GroqResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      messages,
      tools: OPENAI_SALES_TOOLS,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error: ${await res.text()}`);
  }

  return res.json() as Promise<GroqResponse>;
}

export async function runSalesAgentWithGroq(
  ctx: AgentContext,
  history: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SALES_SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const maxIterations = 8;

  for (let i = 0; i < maxIterations; i++) {
    const response = await groqChat(messages);
    const choice = response.choices[0];
    if (!choice) break;

    const assistantMessage = choice.message;

    if (
      choice.finish_reason === "stop" ||
      (!assistantMessage.tool_calls?.length && assistantMessage.content)
    ) {
      return (
        assistantMessage.content?.trim() ||
        "Thanks for your message! How can I help you today?"
      );
    }

    if (assistantMessage.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls,
      });

      for (const toolCall of assistantMessage.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(toolCall.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          input = {};
        }

        const { result, escalated } = await executeSalesTool(
          toolCall.function.name,
          input,
          ctx
        );

        if (escalated) {
          return "I've connected you with our team. A human agent will be with you shortly. Thank you for your patience!";
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    break;
  }

  return "I'm having trouble processing your request. Let me get a team member to help you.";
}
