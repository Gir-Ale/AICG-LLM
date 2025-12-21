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


// Search the in-memory `state.vectorStore` for the topK most similar entries.
// Each entry is expected to have { text, embedding, source }.
export async function searchVectorStore(query, topK = 5) {
  // compute query embedding using engine or fallback
  const queryEmbedding = await embedText(query);

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
        e.embedding = await embedText(e.text || e.input || '');
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
