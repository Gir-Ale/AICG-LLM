function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

import { embedText } from "./embeddings.js";

// Helper to obtain an embedding for a text using the WebLLM engine if available,
// otherwise falling back to the local embedder from `embeddings.js`.
export async function getEmbeddingForText(text) {
  if (state.models && state.models.llm && state.models.llm.embeddings && typeof state.models.llm.embeddings.create === 'function') {
    try {
      const resp = await state.models.llm.embeddings.create({ input: text });
      if (resp && Array.isArray(resp.data) && resp.data[0] && resp.data[0].embedding) {
        return resp.data[0].embedding;
      }
      if (resp && resp.embedding) return resp.embedding;
      if (Array.isArray(resp)) return resp;
    } catch (e) {
      console.warn('Engine embeddings.create failed, falling back to embedText():', e);
    }
  }

  // Fallback to existing embedText implementation
  return embedText(text);
}

// Search the in-memory `state.vectorStore` for the topK most similar entries.
// Each entry is expected to have { text, embedding, source }.
export async function searchVectorStore(query, topK = 5) {
  // compute query embedding using engine or fallback
  const queryEmbedding = await getEmbeddingForText(query);

  const scored = state.vectorStore.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Convenience: add or upsert entries into the vector store. If an entry lacks
// an embedding, this will compute it (using engine or fallback).
export async function upsertVectorEntries(entries = []) {
  for (const e of entries) {
    if (!e.embedding) {
      try {
        e.embedding = await getEmbeddingForText(e.text || e.input || '');
      } catch (err) {
        console.warn('Failed to compute embedding for entry', err);
        continue;
      }
    }
    state.vectorStore.push({ text: e.text || e.input || '', embedding: e.embedding, source: e.source || 'unknown' });
  }
  window.updateMemoryUI?.();
}

export function clearVectorStore() {
  state.vectorStore = [];
  window.updateMemoryUI?.();
}
