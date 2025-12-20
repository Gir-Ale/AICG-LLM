# Local LLM Literature Reviewer

This is a client-side RAG (retrieval-augmented generation) demo that extracts PDF text in the browser, embeds chunks locally, performs vector search, and uses a local WebLLM model for generation.

Quick start

1. Serve the folder (requires a static server):

```powershell
cd "x:\\Central Files\\11-Études\\CT A4\\AICG\\AICG-LLM"
python -m http.server 8000
```

2. Open the app in a Chromium browser (or Brave) that supports `type=module`:

```
http://localhost:8000/index.html
```

3. Steps:
- Select a small quantized model (`q4f16` / `q4f32`) from the Model dropdown and click `Download Model`.
- Drag & drop PDFs into the left panel. The app will extract text, chunk, embed, and index them.
- Use the chat input or `Generate Literature Review` to create grounded outputs.

Notes & troubleshooting

- Use small quantized models to avoid browser memory issues. If loading fails, try a different model listed in the dropdown.
- Model download and initialization can take time; watch the status bar.
- If the embedder isn't available, the app falls back to LLM-only mode but results won't be grounded.

Testing

- A simple smoke test is provided at `tests/run_smoke_test.js` (requires Node). It performs basic file checks on the project.

Optional features

- Text-to-speech (Speak) and basic speech-to-text (Record) are provided via browser APIs when available.

License

MIT
