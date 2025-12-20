import { WebWorkerMLCEngineHandler } from "https://esm.run/@mlc-ai/web-llm";

// Minimal worker entrypoint used by CreateWebWorkerMLCEngine.
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg) => {
  try {
    handler.onmessage(msg);
  } catch (e) {
    // surface minimal error to main thread
    console.error('Worker handler error', e);
  }
};
