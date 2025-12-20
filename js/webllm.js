import * as webllm from "https://esm.run/@mlc-ai/web-llm";

let engine = null;
let workerInstance = null;
// Preferred model IDs to try (fallbacks)
const MODEL_CANDIDATES = [
  "Llama-3.1-8B-Instruct",
  "Llama-3.2-1B-Instruct",
  "Llama-3.2-1B"
];

async function loadLLM() {
  window.updateStatus?.("Loading LLM model...");
  // Prefer a worker-backed engine at startup to avoid blocking the UI.
  try {
    if (typeof Worker !== 'undefined' && typeof webllm.CreateWebWorkerMLCEngine === 'function') {
      if (!workerInstance) {
        workerInstance = new Worker(new URL('./llmWorker.js', import.meta.url), { type: 'module' });
      }
      engine = await webllm.CreateWebWorkerMLCEngine(workerInstance, null, {
        initProgressCallback: (report) => {
          if (report.progress !== undefined) {
            const pct = Math.round(report.progress * 100);
            state.status = `Loading LLM (${pct}%)`;
            window.updateStatus?.(state.status);
          } else if (report.text) {
            state.status = report.text;
            window.updateStatus?.(state.status);
          }
        }
      });
    } else {
      engine = new webllm.MLCEngine();
    }
  } catch (e) {
    console.warn('Worker-backed engine init failed, falling back to MLCEngine:', e);
    engine = new webllm.MLCEngine();
    if (engine.setInitProgressCallback) {
      engine.setInitProgressCallback((report) => {
        if (report.progress) {
          const pct = Math.round(report.progress * 100);
          state.status = `Loading LLM (${pct}%)`;
          window.updateStatus?.(state.status);
        } else if (report.text) {
          state.status = report.text;
          window.updateStatus?.(state.status);
        }
      });
    }
  }

  let loaded = false;

  // Try models listed in the prebuilt app config first (these include full model_ids)
  const prebuilt = webllm.prebuiltAppConfig && webllm.prebuiltAppConfig.model_list;
  const runtimeIds = Array.isArray(prebuilt)
    ? prebuilt.map(m => m.model_id || m.model).filter(Boolean)
    : [];

  const tryIds = runtimeIds.length ? runtimeIds : MODEL_CANDIDATES;

  for (const candidate of tryIds) {
    try {
      state.status = `Loading LLM ${candidate}...`;
      window.updateStatus?.(state.status);
      await engine.reload(candidate, {
        progressCallback: (report) => {
          if (report.progress) {
            const pct = Math.round(report.progress * 100);
            state.status = `Loading LLM ${candidate} (${pct}%)`;
            window.updateStatus?.(state.status);
          }
        }
      });

      state.models.llm = engine;
      state.status = `LLM ready (${candidate})`;
      window.updateStatus?.(state.status);
      console.info(`Loaded model: ${candidate}`);
      loaded = true;
      break;
    } catch (err) {
      console.warn(`Failed to load model ${candidate}:`, err);
      // try next candidate
    }
  }

  if (!loaded) {
    // If configured candidates failed, query the engine for available models
    let available = null;
    try {
      if (engine.listModels) {
        available = await engine.listModels();
      } else if (engine.getModelList) {
        available = await engine.getModelList();
      } else if (engine.modelList) {
        available = engine.modelList;
      } else if (engine.appConfig && engine.appConfig.model_list) {
        available = engine.appConfig.model_list;
      }
    } catch (e) {
      console.warn("Failed to retrieve available models:", e);
    }

    // Try available model_ids from the runtime (if any)
    const availableIds = Array.isArray(available)
      ? available.map(a => a.model_id || a.model).filter(Boolean)
      : [];

    if (availableIds.length > 0) {
      console.info("Attempting to load available model_ids:", availableIds.slice(0, 5));
      for (const availId of availableIds.slice(0, 5)) {
        try {
          window.updateStatus?.(`Loading available model ${availId}...`);
          await engine.reload(availId, {
            progressCallback: (report) => {
              if (report.progress) {
                const pct = Math.round(report.progress * 100);
                window.updateStatus?.(`Loading LLM ${availId} (${pct}%)`);
              }
            }
          });

          state.models.llm = engine;
          state.status = `LLM ready (${availId})`;
          window.updateStatus?.(`LLM ready (${availId})`);
          console.info(`Loaded available model: ${availId}`);
          loaded = true;
          break;
        } catch (err) {
          console.warn(`Failed to load available model ${availId}:`, err);
        }
      }
    }

    const candidateStr = MODEL_CANDIDATES.join(", ");
    const availStr = available ? JSON.stringify(available).slice(0, 1000) : "unknown";
    const msg = `No configured models found. Checked: ${candidateStr}. Available models: ${availStr}`;
    if (!loaded) {
      window.updateStatus?.("LLM load failed (no models)");
      console.error(msg);
      throw new Error(msg);
    }
  }
}

// Auto-load model on startup
loadLLM();

// Expose available models from prebuilt config
export const availableModels = (webllm.prebuiltAppConfig && Array.isArray(webllm.prebuiltAppConfig.model_list))
  ? webllm.prebuiltAppConfig.model_list.map(m => m.model_id || m.model)
  : [];

export async function initializeWebLLMEngine(selectedModel) {
  // Show progress in the shared status bar
  window.updateStatus?.("Loading LLM model...");

  // Prefer worker-backed engine when available (non-blocking)
  if (typeof Worker !== 'undefined' && typeof webllm.CreateWebWorkerMLCEngine === 'function') {
    try {
      if (!workerInstance) {
        workerInstance = new Worker(new URL('./llmWorker.js', import.meta.url), { type: 'module' });
      }
      engine = await webllm.CreateWebWorkerMLCEngine(workerInstance, selectedModel, {
        initProgressCallback: (report) => {
          if (report.progress !== undefined) {
            const pct = Math.round(report.progress * 100);
            state.status = `Loading LLM (${pct}%)`;
            window.updateStatus?.(state.status);
          } else if (report.text) {
            state.status = report.text;
            window.updateStatus?.(state.status);
          }
        }
      });

      state.models.llm = engine;
      state.status = `LLM ready (${selectedModel})`;
      window.updateStatus?.(state.status);
      console.info(`Initialized model (worker): ${selectedModel}`);
      return;
    } catch (e) {
      console.warn('Worker engine init failed, falling back to direct engine:', e);
      // fall through to fallback path
    }
  }

  // Fallback to direct MLCEngine usage
  if (!engine) engine = new webllm.MLCEngine();

  if (engine.setInitProgressCallback) {
    engine.setInitProgressCallback((report) => {
      if (report.progress !== undefined) {
        const pct = Math.round(report.progress * 100);
        state.status = `Loading LLM (${pct}%)`;
        window.updateStatus?.(state.status);
      } else if (report.text) {
        state.status = report.text;
        window.updateStatus?.(state.status);
      }
    });
  }

  try {
    await engine.reload(selectedModel, { temperature: 1.0, top_p: 1 });
    state.models.llm = engine;
    state.status = `LLM ready (${selectedModel})`;
    window.updateStatus?.(state.status);
    console.info(`Initialized model: ${selectedModel}`);
  } catch (e) {
    console.error(`Failed to initialize ${selectedModel}:`, e);
    window.updateStatus?.(`Error loading ${selectedModel}: ${e.message || e.name || 'failure'}`);

    // Try a sensible default model from availableModels or fall back to MODEL_CANDIDATES
    const defaultModel = (Array.isArray(availableModels) && availableModels.find(m => /q4f16|q4f32|low/i.test(m)))
      || (Array.isArray(availableModels) && availableModels[0])
      || MODEL_CANDIDATES[MODEL_CANDIDATES.length - 1];

    if (defaultModel && defaultModel !== selectedModel) {
      try {
        window.updateStatus?.(`Loading default model ${defaultModel}...`);
        await engine.reload(defaultModel, { temperature: 1.0, top_p: 1 });
        state.models.llm = engine;
        state.status = `LLM ready (${defaultModel})`;
        window.updateStatus?.(state.status);
        console.info(`Initialized default model: ${defaultModel}`);
        return;
      } catch (errDefault) {
        console.error(`Failed to initialize default model ${defaultModel}:`, errDefault);
        window.updateStatus?.(`Failed to load default model: ${errDefault.message || errDefault.name}`);
        throw errDefault;
      }
    }

    // No default or failed - rethrow
    throw e;
  }
}

// Streaming helper (mirrors working example)
// Expose some helpers globally for UI integration
window.engine = engine; // may be null initially
window.getEngineStats = () => engine?.runtimeStatsText ? engine.runtimeStatsText() : Promise.resolve("");

export async function generateResponse(userMessage) {
  if (!state.models.llm) {
    throw new Error("LLM not ready");
  }

  const messages = [
    {
      role: "system",
      content: "You are a helpful assistant."
    },
    ...state.chatHistory,
    {
      role: "user",
      content: userMessage
    }
  ];

  const reply = await engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 512
  });

  return reply.choices[0].message.content;
}

// Expose globally for UI
window.generateResponse = generateResponse;
