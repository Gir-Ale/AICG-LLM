// vectorStore.js
import { embedText } from "./embeddings.js";

/* ---------------------------------- */
/* Cosine Similarity                  */
/* ---------------------------------- */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    throw new Error("cosineSimilarity: vectors must be arrays of equal length");
  }

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ---------------------------------- */
/* Search Vector Store                 */
/* ---------------------------------- */
export async function searchVectorStore(query, topK = 5) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("searchVectorStore: query must be a non-empty string");
  }

  // compute query embedding
  const queryEmbedding = await embedText(query);

  // filter out invalid chunks
  const validChunks = state.vectorStore.filter(
    entry => typeof entry.text === "string" && entry.text.trim().length > 0 && Array.isArray(entry.embedding)
  );

  const scored = validChunks.map(entry => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/* ---------------------------------- */
/* Upsert / Add Entries                */
/* ---------------------------------- */
export async function upsertVectorEntries(entries = []) {
  for (const e of entries) {
    const text = e.text || e.input;
    if (!text || !text.trim()) {
      console.warn("Skipping empty entry:", e);
      continue;
    }

    if (!e.embedding) {
      try {
        e.embedding = await embedText(text);
      } catch (err) {
        console.warn("Failed to compute embedding for entry:", err, e);
        continue;
      }
    }

    state.vectorStore.push({
      text,
      embedding: e.embedding,
      source: e.source || "unknown"
    });
  }

  // Update UI if available
  window.updateMemoryUI?.();
}

/* ---------------------------------- */
/* Clear Vector Store                  */
/* ---------------------------------- */
export function clearVectorStore() {
  state.vectorStore = [];
  window.updateMemoryUI?.();
}
