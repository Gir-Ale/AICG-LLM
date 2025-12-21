import * as webllm from "https://esm.run/@mlc-ai/web-llm";

/* ------------------------------------------------------------------ */
/* Internal State                                                      */
/* ------------------------------------------------------------------ */

let engine = null;
let worker = null;
let currentModel = null;

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function reportStatus(text) {
  if (typeof window !== "undefined" && window.updateStatus) {
    window.updateStatus(text);
  }
}

function progressHandler(prefix) {
  return (report) => {
    if (report?.progress !== undefined) {
      const pct = Math.round(report.progress * 100);
      reportStatus(`${prefix} (${pct}%)`);
    } else if (report?.text) {
      reportStatus(report.text);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Engine Creation                                                     */
/* ------------------------------------------------------------------ */

async function createEngine() {
  reportStatus("Initializing LLM engine...");

  if (typeof Worker !== "undefined" &&
      typeof webllm.CreateWebWorkerMLCEngine === "function") {
    try {
      if (!worker) {
        worker = new Worker(
          new URL("./llmWorker.js", import.meta.url),
          { type: "module" }
        );
      }

      return await webllm.CreateWebWorkerMLCEngine(
        worker,
        null,
        { initProgressCallback: progressHandler("Loading engine") }
      );
    } catch (err) {
      console.warn("Worker engine failed, falling back:", err);
    }
  }

  const fallback = new webllm.MLCEngine();
  fallback.setInitProgressCallback?.(
    progressHandler("Loading engine")
  );
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Model Resolution                                                    */
/* ------------------------------------------------------------------ */

function getRuntimeModels() {
  const list = webllm.prebuiltAppConfig?.model_list;
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.map(m => m.model_id || m.model).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function initLLM(modelId = null) {
  if (!engine) engine = await createEngine();

  const models = getRuntimeModels();
  if (!models.length) throw new Error("No models available");

  const selectedModel = modelId || models[0];
  reportStatus(`Loading model: ${selectedModel}`);

  try {
    await engine.reload(selectedModel, {
      progressCallback: progressHandler(`Loading ${selectedModel}`)
    });
    currentModel = selectedModel;

    reportStatus(`LLM ready (${selectedModel})`);
    console.info("LLM loaded:", selectedModel);

    // Return a wrapper object compatible with ragEngine
    return {
      chat: {
        completions: {
          create: async ({ messages, temperature = 0.7, max_tokens = 512 }) => {
            const result = await engine.chat.completions.create({
              messages,
              temperature,
              max_tokens
            });
            return result;
          }
        }
      }
    };
  } catch (err) {
    console.error(`Failed to load model ${selectedModel}`, err);
    throw err;
  }
}

export async function generate(message, chatHistory = []) {
  if (!engine || !currentModel) {
    throw new Error("LLM not initialized");
  }

  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    ...chatHistory,
    { role: "user", content: message }
  ];

  const result = await engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 512
  });

  return result.choices[0].message.content;
}

export function getStats() {
  return engine?.runtimeStatsText
    ? engine.runtimeStatsText()
    : Promise.resolve("");
}

export function listAvailableModels() {
  return getRuntimeModels();
}

/* ------------------------------------------------------------------ */
/* Optional global exposure (UI convenience)                           */
/* ------------------------------------------------------------------ */

if (typeof window !== "undefined") {
  window.LLM = {
    init: initLLM,
    generate,
    stats: getStats,
    models: listAvailableModels
  };
}
