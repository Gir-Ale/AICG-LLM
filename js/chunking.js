export function chunkText(text, size = 500, overlap = 100) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = start + size;
    const chunk = text.slice(start, end);

    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    start += size - overlap;
  }

  return chunks;
}
