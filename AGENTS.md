<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent notes

## WhatsApp AI sales agent

See **[AI-AGENT.md](./AI-AGENT.md)** for how the sales agent works (pipeline, prompts, tools, store scoping, images, recovery).

**When changing AI behavior** under `src/lib/ai/` or the WhatsApp webhook, update `AI-AGENT.md` and add a changelog entry. The Cursor rule `.cursor/rules/ai-agent-docs.mdc` applies to those paths.
