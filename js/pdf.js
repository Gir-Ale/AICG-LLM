import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
import { chunkText } from "./chunking.js";
import { embedAllChunks } from "./embeddings.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

const pdfInput = document.getElementById("pdfInput");
const dropZone = document.getElementById("pdfDropZone");

function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/-\s+/g, "")
    .trim();
}

if (dropZone) {
  dropZone.addEventListener("click", () => pdfInput.click());

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("bg-gray-50");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("bg-gray-50");
  });

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropZone.classList.remove("bg-gray-50");
    const files = [...e.dataTransfer.files].filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) return;
    await handleFiles(files);
  });
}

if (pdfInput) {
  pdfInput.addEventListener("change", async (e) => {
    const files = [...e.target.files];
    await handleFiles(files);
  });
}

export async function handleFiles(files) {
  window.updateStatus?.("Extracting PDFs...");

  for (const file of files) {
    try {
      await extractPdfText(file);
    } catch (err) {
      console.error("Failed to extract PDF:", err);
    }
  }

  window.updateMemoryUI?.();

  // Phase 2: embed chunks
  try {
    await embedAllChunks();
  } catch (err) {
    console.error("Embedding failed:", err);
    window.updateStatus?.("Embedding failed");
  }
}

export async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = content.items
      .map(item => item.str)
      .join(" ");

    fullText += pageText + "\n";
  }

  fullText = cleanText(fullText);

  state.documents.push({
    filename: file.name,
    text: fullText
  });

  // Chunk immediately after extraction
  const chunks = chunkText(fullText);

  chunks.forEach(chunk => {
    state.chunks.push({
      text: chunk,
      source: file.name
    });
  });
}