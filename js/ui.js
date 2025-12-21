import { runRAG} from "./rag.js";
import { embedAllChunks } from "./embeddings.js";
import { initLLM  , listAvailableModels } from "./webllm.js";

const statusBar = document.getElementById("statusBar");
const memoryInfo = document.getElementById("memoryInfo");
const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send");
const reviewBtn = document.getElementById("reviewBtn");
const tempSlider = document.getElementById("tempSlider");
const systemPromptInput = document.getElementById("systemPrompt");
const resetPromptBtn = document.getElementById("resetPromptBtn");
const modelSelection = document.getElementById("model-selection");
const downloadBtn = document.getElementById("download");
let currentLLM = null;
// downloadStatus element not used; omitted

function updateStatus(text) {
  state.status = text;
  statusBar.innerText = `Status: ${text}`;
}

// Initialize status bar from current state (in case models loaded earlier)
updateStatus(state.status || "Ready");

function updateMemoryUI() {
  const sources = {};

  state.vectorStore.forEach(v => {
    sources[v.source] = (sources[v.source] || 0) + 1;
  });

  let html = `
    Documents: ${state.documents.length}<br/>
    Chunks: ${state.chunks.length}<br/>
    Vectors: ${state.vectorStore.length}<br/><br/>
  `;

  for (const [file, count] of Object.entries(sources)) {
    html += `<button class="memory-file text-left w-full text-sm py-1" data-source="${file}">📄 ${file}: ${count} vectors</button>`;
  }

  memoryInfo.innerHTML = html || "No documents loaded.";
}

function showDocumentChunks(source) {
  const details = document.getElementById("memoryDetails");
  if (!details) return;

  const chunks = state.chunks.filter(c => c.source === source);
  if (chunks.length === 0) {
    details.innerHTML = `No chunks for ${source}`;
    return;
  }

  const container = document.createElement('div');
  container.innerHTML = `<strong>Chunks for ${source} (${chunks.length})</strong>`;
  const list = document.createElement('div');
  list.classList.add('mt-2');

  chunks.forEach((c, i) => {
    const item = document.createElement('div');
    item.classList.add('p-2', 'border', 'mb-1', 'rounded', 'text-sm', 'cursor-pointer');
    item.textContent = c.text.slice(0, 300) + (c.text.length > 300 ? '…' : '');
    item.title = 'Click to insert into chat as evidence';
    item.addEventListener('click', () => {
      addChatMessage('assistant', `CITATION (${source} — chunk ${i + 1}):\n` + c.text);
    });
    list.appendChild(item);
  });

  details.innerHTML = '';
  details.appendChild(container);
  details.appendChild(list);
}

function renderMarkdown(mdText) {
  try {
    const html = (typeof marked !== 'undefined') ? marked.parse(mdText || '') : (mdText || '');
    if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html);
    return html;
  } catch (e) {
    return mdText || '';
  }
}


function appendMessage(message) {
  const container = document.createElement("div");
  container.classList.add("message-container", "mb-2");
  const newMessage = document.createElement("div");
  newMessage.classList.add("message");
  newMessage.innerHTML = renderMarkdown(message.content || "");

  if (message.role === "user") container.classList.add("user");
  else container.classList.add("assistant");

  container.appendChild(newMessage);
  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function updateLastMessage(content) {
  const messageDoms = chatBox.querySelectorAll(".message");
  const lastMessageDom = messageDoms[messageDoms.length - 1];
  if (lastMessageDom) lastMessageDom.innerHTML = renderMarkdown(content || "");
}

// Backwards-compatible helper
function addChatMessage(role, content) {
  // do not push system messages into chat history
  if (role !== 'system') {
    state.chatHistory.push({ role, content });
  }
  appendMessage({ role, content });
}

sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Memory list click handler (delegated)
memoryInfo.addEventListener('click', (e) => {
  const target = e.target.closest('.memory-file');
  if (!target) return;
  const src = target.getAttribute('data-source');
  if (src) showDocumentChunks(src);
});

// TTS (Text-to-Speech)
const speakBtn = document.getElementById('speakBtn');

if (speakBtn) {
  speakBtn.addEventListener('click', () => {
    // speak last assistant message
    const messages = chatBox.querySelectorAll('.message-container');
    for (let i = messages.length - 1; i >= 0; i--) {
      const node = messages[i];
      if (node.classList.contains('assistant')) {
        const text = node.querySelector('.message')?.textContent || '';
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(text);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        } else {
          alert('TTS not supported in this browser');
        }
        break;
      }
    }
  });
}


async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  // Clear input and display user message
  chatInput.value = "";
  addChatMessage("user", text);

  // Placeholder assistant message
  appendMessage({ role: "assistant", content: "typing..." });
  sendBtn.disabled = true;

  try {
    // Ensure LLM is initialized
    if (!currentLLM) {
      currentLLM = await initLLM(modelSelection.value);
    }

    // Call RAG engine
    const finalResponse = await runRAG({
      query: text,
      llm: currentLLM,
      systemPrompt: state.controls.systemPrompt,
      history: state.chatHistory,
      temperature: state.controls.temperature,
      maxTokens: 512
    });

    // Update assistant message in DOM
    updateLastMessage(finalResponse);

    // Record assistant reply in history (truncated to 1200 chars)
    const truncated = finalResponse.length > 1200
      ? finalResponse.slice(0, 1200) + '\n…'
      : finalResponse;
    state.chatHistory.push({ role: "assistant", content: truncated });



  } catch (err) {
    console.error(err);
    updateLastMessage("[error]");
  } finally {
    sendBtn.disabled = false;
  }
}

const DEFAULT_SYSTEM_PROMPT = 
`You are an AI assistant operating in a retrieval-augmented generation (RAG) system, but you are expected to act like an Academic Researcher.
Source Priority (STRICT):
Retrieved documents (highest priority)
General model knowledge (only if retrieval fails)
Rules (NON-NEGOTIABLE):
You must search the retrieved documents first for every question.
If any relevant information exists, you must use it and must not rely on general knowledge.
Use general knowledge only if no retrieved content is relevant.
Never mix retrieved content and general knowledge in the same factual claim.

Citations (MANDATORY):
Every factual statement must be cited.
Use:
[Retrieved: <doc_id / title / chunk>]
[Model general knowledge]
If no retrieved content is relevant, explicitly say so before using general knowledge.
Response Format (REQUIRED):
Retrieval Check:
<Relevant / Not relevant>
Answer:
<Answer with inline citations>
Sources:
- <source list>

Hard Fail Conditions:
Do NOT hallucinate facts or citations.
Do NOT answer without citations.
If neither retrieved documents nor reliable general knowledge are sufficient, say so explicitly.
`;

systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
state.controls.systemPrompt = DEFAULT_SYSTEM_PROMPT;

tempSlider.addEventListener("input", () => {
  state.controls.temperature = Number(tempSlider.value);
});

systemPromptInput.addEventListener("input", () => {
  state.controls.systemPrompt = systemPromptInput.value;
});

resetPromptBtn.addEventListener("click", () => {
  systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
  state.controls.systemPrompt = DEFAULT_SYSTEM_PROMPT;
});

// Expose UI helpers globally for other modules
window.updateStatus = updateStatus;
window.updateMemoryUI = updateMemoryUI;
window.addChatMessage = addChatMessage;
window.sendMessage = sendMessage;
window.showDocumentChunks = showDocumentChunks;

// Populate model selection and wire download button
function populateModelList() {
  const models = listAvailableModels();

  modelSelection.innerHTML = "";

  if (!models.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No models available";
    modelSelection.appendChild(opt);
    modelSelection.disabled = true;
    downloadBtn.disabled = true;
    return;
  }

  for (const modelId of models) {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = modelId;
    modelSelection.appendChild(option);
  }

  modelSelection.disabled = false;
  downloadBtn.disabled = false;
  modelSelection.value = models[0];
}

populateModelList();

downloadBtn.addEventListener("click", async () => {
  downloadmodel();
});

async function downloadmodel() {
  const modelId = modelSelection.value;
  if (!modelId) return;

  sendBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    updateStatus(`Downloading model: ${modelId}`);
    await initLLM(modelId);
    currentLLM = await initLLM(modelId);
    updateStatus(`Model ready: ${modelId}`);
  } catch (err) {
    console.error(err);
    updateStatus("Failed to load model");
  } finally {
    sendBtn.disabled = false;
    downloadBtn.disabled = false;
  }
}
//initial loading of model
downloadmodel();
