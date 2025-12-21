// ragEngine.js

import { searchVectorStore } from "./vectorStore.js";

/* ---------------------------------- */
/* Utilities                          */
/* ---------------------------------- */

const estimateTokens = (text = "") => Math.ceil(text.length / 4);

const truncate = (text = "", maxChars) =>
  text.length > maxChars ? text.slice(0, maxChars) + "…" : text;

function groupBySource(chunks) {
  return chunks.reduce((acc, c) => {
    acc[c.source] ??= [];
    acc[c.source].push(c.text);
    return acc;
  }, {});
}

/* ---------------------------------- */
/* Context Retrieval                  */
/* ---------------------------------- */

async function retrieveContext({
  query,
  topK,
  maxChars,

}) {
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

function buildMessages({ systemPrompt, userPrompt, context = "", history = [], historyBudget = 256 }) {
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
  llm,
  embedderAvailable = true,
  systemPrompt = "You are an academic researcher.",
  history = [],
  temperature = 0.2,
  maxTokens = 512
}) {
  let context = "";

  if (embedderAvailable) {
    context = await retrieveContext({
      query,
      topK: 4 ,
      maxChars: 3000,
    });
  }

  const messages = buildMessages({
    systemPrompt,
    userPrompt: query,
    context,
    history
  });

  const reply = await llm.chat.completions.create({
    messages,
    temperature,
    max_tokens: maxTokens
  });

  return reply.choices[0].message.content;
}
