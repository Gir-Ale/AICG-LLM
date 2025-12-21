export function chunkText(text, size = 500, overlap = 100) {
  if (!text || text.trim().length === 0) return [];
  
  // Clean text first
  const cleanText = text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n") // Preserve paragraph breaks
    .trim();
  
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
  const chunks = [];
  let currentChunk = "";
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > size && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep overlap by taking last part of current chunk
      const words = currentChunk.split(" ");
      const overlapText = words.slice(-20).join(" "); // Keep ~20 words for overlap
      currentChunk = overlapText + " " + sentence;
    } else {
      currentChunk += sentence + " ";
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  // Filter out very small chunks
  return chunks.filter(chunk => chunk.length > 50);
}
