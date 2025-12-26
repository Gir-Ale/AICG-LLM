// ragEngine.js
import { searchVectorStore } from "./vectorStore.js";

/* ---------------------------------- */
/* Utilities                          */
/* ---------------------------------- */

const estimateTokens = (text = "") => Math.ceil(text.length / 4);

const truncate = (text = "", maxChars) =>
  text.length > maxChars ? text.slice(0, maxChars) + "…" : text;

/* ---------------------------------- */
/* Context Retrieval                  */
/* ---------------------------------- */

async function retrieveContext({ query, topK, maxChars }) {
  const results = await searchVectorStore(query, topK);
  const chunks = [];
  const perChunkLimit = 400;
  let used = 0;

  for (const r of results) {
    if (used >= maxChars) break;

    const body = truncate(r.text, Math.min(perChunkLimit, maxChars - used));
    chunks.push(
      `[Source: ${r.source}]\n${body}`
    );
    used += body.length;
  }

  return chunks.join("\n\n");
}

/* ---------------------------------- */
/* Prompt Builder                     */
/* ---------------------------------- */

function buildMessages({ systemPrompt = state.systemPrompt, userPrompt, context = "",   history = state.chatHistory, historyBudget = 512 }) {
  // Merge system prompt + context
  let fullSystemPrompt = systemPrompt;
  if (context) fullSystemPrompt += "\n\nCONTEXT:\n" + context;

  const messages = [
    { role: "system", content: fullSystemPrompt }  // MUST be first and ONLY system message
  ];

  // Append chat history
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(history[i].content);
    if (used + t > historyBudget) break;
    messages.push(history[i]);  // user or assistant
    used += t;
  }

  // Finally, append current user message
  messages.push({ role: "user", content: userPrompt });

  return messages;
}




/* ---------------------------------- */
/* Main RAG Entry Point               */
/* ---------------------------------- */

export async function runRAG({
  query,
  llm = state.models.llm,
  temperature = state.temperature,
  maxTokens = state.tokens,
  systemPrompt = state.systemPrompt
}) {
  let context = await retrieveContext({
      query,
      topK: 4 ,
      maxChars: 30000,
    });

  const messages = buildMessages({
    systemPrompt,
    userPrompt: query,
    context
  });

  const reply = await llm.chat.completions.create({
    messages,
    temperature,
    max_tokens: maxTokens
  });

  return reply.choices[0].message.content;
}

export async function runHistoryRAG({
  query,
  llm = state.models.llm,
  temperature = state.temperature,
  maxTokens = state.tokens/4,
  systemPrompt = "Condense the message into a minimal, information-dense summary for LLM memory. Keep all essential facts; remove redundancy and fluff. Output only the summary."
}) {
  const messages = buildMessages({
    systemPrompt,
    userPrompt: query,
  });

  const reply = await llm.chat.completions.create({
    messages,
    temperature,
    max_tokens: maxTokens
  });

  return reply.choices[0].message.content;
}
