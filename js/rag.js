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
  mode
}) {
  const results = await searchVectorStore(query, topK);
  const chunks = [];

  const perChunkLimit = mode === "qa" ? 400 : 600;
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

function buildMessages({
  systemPrompt,
  userPrompt,
  context = "",
  history = [],
  historyBudget = 256
}) {
  const messages = [];

  messages.push({
    role: "system",
    content: systemPrompt
  });

  if (context) {
    messages.push({
      role: "system",
      content: `CONTEXT:\n${context}`
    });
  }

  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = estimateTokens(history[i].content);
    if (used + t > historyBudget) break;
    messages.splice(1, 0, history[i]);
    used += t;
  }

  messages.push({
    role: "user",
    content: userPrompt
  });

  return messages;
}

/* ---------------------------------- */
/* Literature Review Mode             */
/* ---------------------------------- */

async function runLiteratureReview({
  llm,
  chunks,
  systemPrompt,
  temperature,
  maxTokens
}) {
  const grouped = groupBySource(chunks);
  const summaries = [];

  for (const [source, texts] of Object.entries(grouped).slice(0, 10)) {
    const prompt = `Summarize this paper in 2–3 sentences focusing on contributions and methods.`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${prompt}\n\n${truncate(texts.join("\n"), 1200)}` }
    ];

    const reply = await llm.chat.completions.create({
      messages,
      temperature: 0,
      max_tokens: 120
    });

    summaries.push({
      source,
      summary: reply.choices[0].message.content
    });
  }

  const synthesisPrompt = summaries
    .map(s => `Source: ${s.source}\n${s.summary}`)
    .join("\n\n");

  const finalMessages = [
    {
      role: "system",
      content: `${systemPrompt}\nUse only the provided summaries.`
    },
    {
      role: "user",
      content: `Write a structured literature review with sections:
Overview, Themes, Comparisons, Open Questions, References.\n\n${truncate(synthesisPrompt, 6000)}`
    }
  ];

  const final = await llm.chat.completions.create({
    messages: finalMessages,
    temperature,
    max_tokens: maxTokens
  });

  return final.choices[0].message.content;
}

/* ---------------------------------- */
/* Main RAG Entry Point               */
/* ---------------------------------- */

export async function runRAG({
  query,
  llm,
  embedderAvailable = true,
  mode = "qa",
  systemPrompt = "You are an academic researcher.",
  history = [],
  temperature = 0.2,
  maxTokens = 512
}) {
  let context = "";

  if (embedderAvailable) {
    context = await retrieveContext({
      query,
      topK: mode === "qa" ? 4 : 8,
      maxChars: 3000,
      mode
    });
  }

  if (mode === "literature-review") {
    const rawChunks = await searchVectorStore(query, 12);
    return runLiteratureReview({
      llm,
      chunks: rawChunks,
      systemPrompt,
      temperature,
      maxTokens
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
