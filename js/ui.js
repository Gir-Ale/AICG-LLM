import { runRAG, generateReviewPlan } from "./rag.js";
import { embedAllChunks } from "./embeddings.js";
import { initializeWebLLMEngine, availableModels } from "./webllm.js";

const statusBar = document.getElementById("statusBar");
const memoryInfo = document.getElementById("memoryInfo");
const chatBox = document.getElementById("chat-box");
const chatStats = document.getElementById("chat-stats");
const chatInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send");
const reviewBtn = document.getElementById("reviewBtn");
const tempSlider = document.getElementById("tempSlider");
const systemPromptInput = document.getElementById("systemPrompt");
const resetPromptBtn = document.getElementById("resetPromptBtn");
const modelSelection = document.getElementById("model-selection");
const downloadBtn = document.getElementById("download");
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

  chatInput.value = "";

  // push and display user message (also record in global chatHistory)
  addChatMessage("user", text);

  // placeholder assistant message (DOM only)
  appendMessage({ role: "assistant", content: "typing..." });

  sendBtn.disabled = true;
  try {
    let finalResponse = '';
    const onProgress = (partial) => {
      updateLastMessage(partial);
    };

    await runRAG(text, { topK: 6, mode: "qa", stream: true, onProgress });

    // After streaming completes, the last content is in the DOM; fetch it
    const messageDoms = chatBox.querySelectorAll('.message');
    const lastMessageDom = messageDoms[messageDoms.length - 1];
    finalResponse = lastMessageDom ? lastMessageDom.innerText : '';

    // record assistant reply in global history (store truncated to avoid huge prompts)
    const truncated = (finalResponse && finalResponse.length > 1200) ? finalResponse.slice(0, 1200) + '\n…' : finalResponse;
    state.chatHistory.push({ role: "assistant", content: truncated });

    // show citations if available
    showCitations();
  } catch (err) {
    console.error(err);
    updateLastMessage("[error]");
  } finally {
    sendBtn.disabled = false;
  }
}

function showCitations() {
  if (!state.lastCitations) return;
  let md = "**Sources Used:**\n";
  for (const [source, count] of Object.entries(state.lastCitations)) {
    md += `- ${source} (${count} chunks)\n`;
  }

  addChatMessage("assistant", md);
}

reviewBtn.addEventListener("click", async () => {
  const query = "Generate a literature review of the uploaded papers.";

  addChatMessage("user", query);
  updateStatus("Planning review...");

  // Ensure embeddings/vector store are ready before planning/review
  if (!state.models.embedder || state.vectorStore.length === 0) {
    updateStatus("Embedding documents (preparing memory)...");
    try {
      await embedAllChunks();
    } catch (e) {
      console.error("Embedding failed:", e);
      updateStatus("Embedding failed");
      return;
    }
  }

  try {
    const plan = await generateReviewPlan();

    updateStatus("Writing review...");

    const response = await runRAG(query, {
      mode: "literature-review",
      topK: 15,
      plan
    });

    addChatMessage("assistant", response);
    showCitations();
    updateStatus("Ready");
  } catch (err) {
    console.error(err);
    updateStatus("Review generation failed");
  }
});



const DEFAULT_SYSTEM_PROMPT = `
You are an academic researcher.
Use ONLY the provided context.
Do not hallucinate sources.
Structure answers clearly and concisely.
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
window.showCitations = showCitations;
window.sendMessage = sendMessage;
window.showDocumentChunks = showDocumentChunks;

// Populate model selection and wire download button
availableModels.forEach((modelId) => {
  const option = document.createElement("option");
  option.value = modelId;
  option.textContent = modelId;
  modelSelection.appendChild(option);
});
if (availableModels.length) modelSelection.value = availableModels[0];

downloadBtn.addEventListener("click", () => {
  const sel = modelSelection.value;
  if (!sel) return;
  initializeWebLLMEngine(sel).then(() => {
    sendBtn.disabled = false;
  }).catch(err => {
    console.error(err);
  });
});
