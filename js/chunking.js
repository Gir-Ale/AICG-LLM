export function chunkText(text, size = 500, overlap = 100) {
  if (!text || text.trim().length === 0) return [];
  
  // Clean text while preserving meaningful structure
  const cleanText = text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
  
  // Split into sentences, preserving punctuation
  const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
  const chunks = [];
  let currentChunk = "";
  let previousChunkEnd = "";
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;
    
    // Test if adding this sentence would exceed size
    const potentialChunk = currentChunk + (currentChunk ? " " : "") + sentence;
    
    if (potentialChunk.length > size && currentChunk.length > 0) {
      // Add the current chunk
      chunks.push(currentChunk.trim());
      
      // Calculate overlap from end of current chunk
      if (overlap > 0) {
        // Use character-based overlap first
        let overlapText = currentChunk.slice(-overlap);
        
        // Find a clean boundary (space or punctuation)
        const lastSpace = overlapText.lastIndexOf(" ");
        if (lastSpace !== -1 && lastSpace > overlapText.length * 0.5) {
          // Prefer to split at a word boundary
          overlapText = overlapText.slice(lastSpace + 1);
        }
        
        // Ensure we don't start with a partial sentence
        if (overlapText.length > 0) {
          // Find sentence boundaries within overlap
          const sentencesInOverlap = overlapText.match(/[^.!?]+[.!?]+/g);
          if (sentencesInOverlap && sentencesInOverlap.length > 0) {
            // Use only complete sentences from overlap
            overlapText = sentencesInOverlap[sentencesInOverlap.length - 1];
          }
        }
        
        previousChunkEnd = overlapText;
        currentChunk = overlapText + (overlapText ? " " : "") + sentence;
      } else {
        // No overlap, start fresh
        previousChunkEnd = "";
        currentChunk = sentence;
      }
    } else {
      // Add to current chunk
      currentChunk = currentChunk ? currentChunk + " " + sentence : sentence;
    }
  }
  
  // Add the final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  // Post-processing to ensure overlap between chunks
  const finalChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    if (overlap > 0 && i > 0) {
      // Calculate how much overlap we need
      const targetOverlap = Math.min(overlap, chunks[i-1].length, chunks[i].length);
      
      // Get overlap from previous chunk
      let overlapFromPrev = chunks[i-1].slice(-targetOverlap);
      
      // Find a clean word boundary
      const firstSpace = overlapFromPrev.indexOf(" ");
      if (firstSpace !== -1) {
        overlapFromPrev = overlapFromPrev.slice(firstSpace + 1);
      }
      
      // Prepend overlap to current chunk if meaningful
      if (overlapFromPrev.trim().length > 20) {
        finalChunks.push(overlapFromPrev.trim() + " " + chunks[i]);
      } else {
        finalChunks.push(chunks[i]);
      }
    } else {
      finalChunks.push(chunks[i]);
    }
  }
  
  // Filter out very small chunks (unless it's the only chunk)
  return finalChunks.length > 1 
    ? finalChunks.filter(chunk => chunk.length > 50)
    : finalChunks;
}