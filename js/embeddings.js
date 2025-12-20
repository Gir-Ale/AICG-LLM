// Prefer using the WebLLM engine's embeddings API when available to avoid
// loading a heavy separate embedder. Fallback to the Hugging Face
// transformers pipeline only when necessary.

let hfPipeline = null;
import { upsertVectorEntries } from "./vectorStore.js";

async function loadHFPipeline() {
  if (hfPipeline) return hfPipeline;
  // lazy-import HF pipeline only if needed
  const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
  window.updateStatus?.("Loading embedding model (HF)...");
  hfPipeline = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );
  state.models.embedder = hfPipeline;
  window.updateStatus?.("Embedding model ready (HF)");
  return hfPipeline;
}

export async function embedText(text) {
  // If WebLLM engine provides embeddings, use it
  if (state.models && state.models.llm && state.models.llm.embeddings && typeof state.models.llm.embeddings.create === 'function') {
    try {
      const resp = await state.models.llm.embeddings.create({ input: text });
      // Normalize response shapes from different implementations
      if (resp && Array.isArray(resp.data) && resp.data[0] && resp.data[0].embedding) {
        return resp.data[0].embedding;
      }
      if (resp && resp.embedding) return resp.embedding;
      // fallback: if engine returned plain array
      if (Array.isArray(resp)) return resp;
    } catch (e) {
      console.warn('Engine embeddings.create failed, falling back to HF pipeline:', e);
    }
  }

  // Fallback to Hugging Face pipeline
  const embedder = await loadHFPipeline();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function embedAllChunks() {
  window.updateStatus?.("Embedding chunks...");
  const batch = [];
  for (let i = 0; i < state.chunks.length; i++) {
    const chunk = state.chunks[i];
    if (state.vectorStore.find(v => v.text === chunk.text)) continue;
    batch.push({ text: chunk.text, source: chunk.source });
    if (batch.length >= 20) {
      await upsertVectorEntries(batch.splice(0));
      window.updateStatus?.(`Embedding chunks... (${i + 1}/${state.chunks.length})`);
    }
  }

  if (batch.length > 0) {
    await upsertVectorEntries(batch);
  }

  window.updateMemoryUI?.();
  window.updateStatus?.("All chunks embedded");
}
