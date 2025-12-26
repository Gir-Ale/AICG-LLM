// ragEngine.js
import { searchVectorStore } from "./vectorStore.js";

/* ---------------------------------- */
/* Utilities                          */
/* ---------------------------------- */

const estimateTokens = (text = "") => Math.ceil(text.length / 4);

/* ---------------------------------- */
/* Context Retrieval                  */
/* ---------------------------------- */

async function retrieveContext({ query, topK = 5, maxChars = 2000 }) {
  // Step 1: Query the vector store for top-K relevant chunks
  const results = await searchVectorStore(query, topK);
  // Step 2: Sort by similarity descending (if searchVectorStore doesn't already)
  results.sort((a, b) => b.similarity - a.similarity);
  const chunks = [];
  let usedChars = 0;
  for (const r of results) {
    if (usedChars >= maxChars) break;
    // Clean the text to avoid mid-word truncation
    const text = r.text.replace(/\s+/g, ' ').trim();
    
    let chunkText = text;
    // Ensure we don’t exceed maxChars
    if (usedChars + chunkText.length > maxChars) {
      chunkText = chunkText.slice(0, maxChars - usedChars);

      // Optional: cut to last full sentence for readability
      const lastPeriod = chunkText.lastIndexOf('.');
      if (lastPeriod > 50) {
        chunkText = chunkText.slice(0, lastPeriod + 1);
      }
    }

    chunks.push(`[Source: ${r.source}]\n${chunkText}`);
    usedChars += chunkText.length;
  }
  // Deduplicate repeated text
  const uniqueChunks = [...new Set(chunks)];
  return uniqueChunks.join("\n\n");
}

/* ---------------------------------- */
/* Prompt Builder                     */
/* ---------------------------------- */

function buildMessages({
  systemPrompt = state.systemPrompt,
  userPrompt,
  context = "",
  history = state.chatHistory,
  historyBudget = 512
}) {
  let fullSystemPrompt = systemPrompt;
  if (context) fullSystemPrompt += "\n\nCONTEXT:\n" + context;

  const messages = [
    { role: "system", content: fullSystemPrompt }
  ];

  let used = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];

    if (
      !msg ||
      typeof msg.content !== "string" ||
      !msg.role
    ) continue;

    const t = estimateTokens(msg.content);
    if (used + t > historyBudget) break;

    messages.push({
      role: msg.role,
      content: msg.content
    });

    used += t;
  }

  messages.push({ role: "user", content: String(userPrompt) });

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
