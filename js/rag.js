import { searchVectorStore } from "./vectorStore.js";

function trimTextToChars(text, chars) {
  if (!text) return "";
  if (!chars || text.length <= chars) return text;
  return text.slice(0, chars) + "…";
}

export function buildRagMessages(userQuery, options = {}) {
  const { systemPrompt, contextText = "", plan = null, historyTokenBudget = 512 } = options;

  const baseSystem = systemPrompt || state.controls?.systemPrompt || "You are an academic researcher.";

  let systemContent = baseSystem;
  if (plan) {
    // keep plan brief
    systemContent += "\n\nREVIEW PLAN:\n" + (plan.length > 2000 ? plan.slice(0, 2000) + '…' : plan);
  }

  if (contextText && contextText.length > 0) {
    // avoid including extremely long context here; assume contextText was already budgeted
    systemContent += "\n\nCONTEXT:\n" + (contextText.length > 20000 ? contextText.slice(0, 20000) + '…' : contextText);
  }

  const messages = [];
  messages.push({ role: "system", content: systemContent });

  // Add chat history up to the token budget (start from most recent)
  if (Array.isArray(state.chatHistory) && state.chatHistory.length > 0) {
    // exclude any stray system messages from history to avoid ordering errors
    const historyItems = state.chatHistory.filter(m => m.role !== 'system');
    const estimateTokens = (s) => Math.ceil((s || "").length / 4);
    let used = 0;
    const picked = [];
    for (let i = historyItems.length - 1; i >= 0; i--) {
      const m = historyItems[i];
      const t = estimateTokens(m.content || '');
      if (used + t > historyTokenBudget) break;
      picked.push(m);
      used += t;
    }
    // picked currently newest->oldest; reverse to chronological order
    picked.reverse().forEach(h => messages.push(h));
  }

  messages.push({ role: "user", content: userQuery });

  return messages;
}

export async function runRAG(userQuery, options = {}) {
  const { topK = 6, mode = "qa", plan = null } = options;

  if (!state.models || !state.models.llm) {
    window.updateStatus?.("LLM model not loaded");
    throw new Error("LLM model not loaded");
  }

  window.updateStatus?.("Retrieving relevant context...");

  let contextText = "";
  const citations = {};

  if (state.models.embedder) {
    // retrieve only topK most relevant chunks
    const retrieved = await searchVectorStore(userQuery, Math.max(3, topK));

    // Conservative token estimation: 1 token ~= 4 chars
    const estimateTokens = (s) => Math.ceil((s || "").length / 4);

    // Determine model context window (fallback to 4096)
    const modelWindow = (state.models.llm && (state.models.llm.context_window_size || state.models.llm.model?.context_window_size)) || 4096;
    // More aggressive conservative budgets
    const reservedForResponse = 128; // tokens reserved for generated response
    const reservedForSystem = 64; // tokens reserved for system + metadata
    const availableForContext = Math.max(128, modelWindow - reservedForResponse - reservedForSystem);

    // Limit context chars roughly (chars ~= tokens * 4)
    const maxContextChars = Math.min(1200, Math.max(800, Math.floor(availableForContext * 3)));

    // Prepare chat history text estimate
    const historyText = (Array.isArray(state.chatHistory) ? state.chatHistory.map(m => m.content).join('\n') : '');
    let usedTokens = estimateTokens(historyText) + estimateTokens(userQuery) + reservedForSystem;
    let usedChars = estimateTokens(historyText) * 4 + (userQuery || '').length + reservedForSystem * 4;

    // Add retrieved chunks incrementally until char budget exhausted (but cap at 3 chunks)
    let i = 0;
    const maxChunksToInclude = (mode === 'qa' ? 1 : 3);
    for (const item of retrieved.slice(0, maxChunksToInclude)) {
      const rawChunk = item.text || '';
      const chunkHeader = `\n[CHUNK ${i + 1}]\nSource: ${item.source}\n`;
      const remainingChars = maxContextChars - usedChars;
      if (remainingChars <= 100) break; // nothing left to add

      // decide how much of chunk to include (cap per chunk stricter for QA)
      const perChunkCap = (mode === 'qa' ? 400 : 500);
      const takeChars = Math.min(rawChunk.length, Math.min(perChunkCap, remainingChars));
      const chunkBody = rawChunk.slice(0, takeChars);
      const chunkStr = `${chunkHeader}${chunkBody}\n`;

      contextText += chunkStr;
      citations[item.source] = (citations[item.source] || 0) + 1;

      const chunkTokens = estimateTokens(chunkStr);
      usedTokens += chunkTokens;
      usedChars += chunkStr.length;
      i += 1;

      // if we added a partial chunk and it's truncated, stop adding further chunks
      if (takeChars < rawChunk.length) break;
    }
  } else {
    window.updateStatus?.("Embedder not available — skipping retrieval");
  }

  state.lastCitations = citations;

  // Compute history token budget and ensure overall prompt fits model window
  const estimateTokens = (s) => Math.ceil((s || "").length / 4);
  const modelWindow = (state.models.llm && (state.models.llm.context_window_size || state.models.llm.model?.context_window_size)) || 4096;
  const reservedForResponse = 256;

  const systemPreview = (state.controls?.systemPrompt || "");
  const estSystem = estimateTokens(systemPreview);
  const estUser = estimateTokens(userQuery);
  const estContext = estimateTokens(contextText);

  // Allowed tokens for system+context+user must be <= modelWindow - reservedForResponse
  const allowedPromptTokens = Math.max(256, modelWindow - reservedForResponse);
  const promptTokens = estSystem + estContext + estUser;
  if (promptTokens > allowedPromptTokens) {
    // truncate contextText proportionally
    const allowedContextTokens = Math.max(0, allowedPromptTokens - estSystem - estUser - 16);
    const allowedContextChars = Math.floor(allowedContextTokens * 4);
    contextText = trimTextToChars(contextText, Math.max(0, allowedContextChars));
  }

  // Use a very small history budget to be safe; drop history entirely for heavy modes
  const historyBudget = (mode === 'literature-review') ? 0 : 64;
  const messages = buildRagMessages(userQuery, { contextText, plan, historyTokenBudget: historyBudget, systemPrompt: systemPreview });
  window.updateStatus?.("Thinking...");

  // If user requested a literature-review mode, use a two-stage approach:
  // 1) Summarize each document (grouped by source) into a short doc-summary.
  // 2) Synthesize the final review using only the doc-summaries to avoid context overload.
  const temperature = state.controls?.temperature ?? 0.2;
  const maxTokensDefault = options.max_tokens || 512;

  let content = "";
  if (mode === 'literature-review') {
    // build or obtain a plan: per-document summaries
    const summarizationLimitPerDoc = 240; // chars taken per document when summarizing
    const docs = groupChunksBySource(state.chunks || []);

    const docSummaries = [];
    // limit number of documents to summarize to avoid explosion
    const maxDocs = 12;
    const docEntries = Object.entries(docs).slice(0, maxDocs);
    for (const [source, chunks] of docEntries) {
      // create a short concatenated doc text (trimmed)
      const docText = chunks.join('\n').slice(0, 1600);
      const summaryPrompt = `Summarize the following document (source: ${source}) in 2-3 concise sentences, focusing on main contributions and methods. Keep summary under 80 words.`;

      const msgs = [
        { role: 'system', content: state.controls?.systemPrompt || 'You are an academic assistant.' },
        { role: 'user', content: `${summaryPrompt}\n\n${trimTextToChars(docText, summarizationLimitPerDoc)}` }
      ];

      try {
        const reply = await state.models.llm.chat.completions.create({ messages: msgs, temperature: 0.0, max_tokens: 120 });
        const s = reply.choices?.[0]?.message?.content?.trim() || '';
        docSummaries.push({ source, summary: s });
      } catch (e) {
        console.warn('Doc summarization failed for', source, e);
      }
    }

    // Build synthesis prompt from docSummaries (limit total chars)
    const summariesText = docSummaries.map(d => `Source: ${d.source}\nSummary: ${trimTextToChars(d.summary, 400)}`).join('\n\n');

    // Ensure synthesized prompt fits model window
    const modelWindow = (state.models.llm && (state.models.llm.context_window_size || state.models.llm.model?.context_window_size)) || 4096;
    const reservedForResponse = 512;
    const allowedChars = Math.floor((modelWindow - reservedForResponse) * 4);
    const truncatedSummaries = trimTextToChars(summariesText, Math.max(800, Math.min(allowedChars, 8000)));

    const synthSystem = (state.controls?.systemPrompt || 'You are an academic researcher.') + '\n\nUse ONLY the provided document summaries. Do not hallucinate sources.';
    const synthMessages = [
      { role: 'system', content: synthSystem },
      { role: 'user', content: `Write a structured literature review based on the following document summaries:\n\n${truncatedSummaries}\n\nInstructions: produce an organized review with sections: Overview, Key Themes, Comparisons, Open Questions, and References (cite sources by name).` }
    ];

    const reply = await state.models.llm.chat.completions.create({ messages: synthMessages, temperature, max_tokens: maxTokensDefault });
    content = reply.choices?.[0]?.message?.content || '';

    // Append doc summary references list
    if (docSummaries.length > 0) {
      let footer = '\n\n-- Document Summaries Used --\n';
      docSummaries.forEach(d => { footer += `- ${d.source}\n`; });
      content += footer;
    }
  } else {
    // default QA/short-answer path (streaming supported)
    const maxTokens = options.max_tokens || 256;
    if (options.stream && typeof options.onProgress === 'function') {
      const stream = await state.models.llm.chat.completions.create({ messages, temperature, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true } });
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          try { options.onProgress(content); } catch (e) {}
        }
      }
    } else {
      const reply = await state.models.llm.chat.completions.create({ messages, temperature, max_tokens: maxTokens });
      content = reply.choices[0].message.content;
    }
  }

  // Append citation summary footer based on retrieved citations
  if (state.lastCitations && Object.keys(state.lastCitations).length > 0) {
    let footer = "\n\n-- Sources used --\n";
    for (const [src, cnt] of Object.entries(state.lastCitations)) {
      footer += `- ${src} (${cnt} chunks)\n`;
    }
    content += footer;
  }

  return content;
}

export async function generateReviewPlan() {
  if (!state.models || !state.models.llm) {
    window.updateStatus?.("LLM model not loaded");
    throw new Error("LLM model not loaded");
  }

  const planPrompt = `You are planning a literature review. Given the context, produce an outline with:\n- Main themes\n- Paper groupings\n- Key comparisons`;

  const chunksToUse = (state.chunks || []).slice(0, 40);
  const contextText = chunksToUse
    .map((c, i) => `CHUNK ${i + 1} (Source: ${c.source}):\n${c.text}`)
    .join("\n\n");

  const messages = buildRagMessages(planPrompt, { contextText });

  const reply = await state.models.llm.chat.completions.create({
    messages,
    temperature: 0.2,
    max_tokens: 300
  });

  return reply.choices[0].message.content;
}

function groupChunksBySource(chunks) {
  const grouped = {};
  chunks.forEach(c => {
    grouped[c.source] = grouped[c.source] || [];
    grouped[c.source].push(c.text);
  });
  return grouped;
}

window.runRAG = runRAG;
window.generateReviewPlan = generateReviewPlan;