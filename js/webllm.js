import * as webllm from "https://esm.run/@mlc-ai/web-llm";

let currentModel = null;
let engine = null;



/* ------------------------------------------------------------------ */
/* Status                                                             */
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
/* Public API                                                          */
/* ------------------------------------------------------------------ */



export async function initLLM(modelId = null) {
  const models = listAvailableModels();
  const selectedModel = modelId || models[0];

  reportStatus(`Loading model: ${selectedModel}`);
  if (!engine) {
    engine = new webllm.MLCEngine({ initProgressCallback: progressHandler(`Loading ${selectedModel}`)});
  }

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

export function listAvailableModels() {
  const list = webllm.prebuiltAppConfig?.model_list;
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.map(m => m.model_id || m.model).filter(Boolean);
}
