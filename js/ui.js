import { runRAG, runHistoryRAG} from "./rag.js";

import { initLLM  , listAvailableModels } from "./webllm.js";

const statusBar = document.getElementById("statusBar");
const memoryInfo = document.getElementById("memoryInfo");
const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send");
const tempSlider = document.getElementById("tempSlider");
const systemPromptInput = document.getElementById("systemPrompt");
const resetPromptBtn = document.getElementById("resetPromptBtn");
const modelSelection = document.getElementById("model-selection");
const downloadBtn = document.getElementById("download");
const tokenInput = document.getElementById("tokenLimit");
// downloadStatus element not used; omitted

function updateStatus(text) // Update status bar text
{
  state.status = text;
  statusBar.innerText = `Status: ${text}`;
}
updateStatus(state.status || "Ready");

function updateMemoryUI() // Update memory/documents UI
{
  const sources = {};

  state.vectorStore.forEach(v => {
    sources[v.source] = (sources[v.source] || 0) + 1;
  });

  let html = `
    Documents: ${state.documents.length}<br/>
    Chunks: ${state.chunks.length}<br/>
    Vectors: ${state.vectorStore.length}<br/>
  `;
  
  if (state.chunks.length > 0 && state.vectorStore.length === 0) {
    html += `<span class="text-yellow-600 text-xs">(Processing...)</span><br/><br/>`;
  } else if (state.vectorStore.length === 0) {
    html += `<span class="text-gray-500 text-xs">(No vectors yet)</span><br/><br/>`;
  } else {
    html += `<span class="text-green-600 text-xs">(Ready for search)</span><br/><br/>`;
  }

  for (const [file, count] of Object.entries(sources)) {
    html += `<button class="memory-file text-left w-full text-sm py-1" data-source="${file}">📄 ${file}: ${count} vectors</button>`;
  }

  memoryInfo.innerHTML = html || "No documents loaded.";
}

function showDocumentChunks(source) // Show chunks for a specific document source
{
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

function renderMarkdown(mdText) //markdown to sanitized HTML
{
  try {
    const html = (typeof marked !== 'undefined') ? marked.parse(mdText || '') : (mdText || '');
    if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(html);
    return html;
  } catch (e) {
    return mdText || '';
  }
}

//control token input
let prevValue = parseInt(tokenInput.value, 10);

tokenInput.addEventListener("input", () => {
  let val = parseInt(tokenInput.value, 10);

  if (isNaN(val)) val = prevValue;

  if (val > prevValue) {
    // Increased → double
    val = prevValue * 2;
    if (val > 32768) val = 32768;
  } else if (val < prevValue) {
    // Decreased → halve
    val = prevValue / 2;
    if (val < 128) val = 128;
  }

  tokenInput.value = val;
  state.tokens = val;
  prevValue = val;
});

function appendMessage(message) {
  const container = document.createElement("div");
  container.classList.add("message-container", "mb-2");

  const newMessage = document.createElement("div");
  newMessage.classList.add("message");
  newMessage.innerHTML = renderMarkdown(message.content || "");

  if (message.role === "user") {
    container.classList.add("user");
    newMessage.style.color = "#3d3a46ff";
  } else {
    container.classList.add("assistant");
    newMessage.style.color = "#000000ff";
  }

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
  if (role !== "system") {
    state.chatHistory.push({
    role,
    content: String(content)
  });
  }
  appendMessage({ role, content });
}

// Compact chat history by running RAG on it and storing the response
async function historyCompact(role, content) {
  if (typeof content !== "string") return;

  const summary = await runHistoryRAG({ query: content });

  state.chatHistory.push({
    role,
    content: String(summary)
  });

  // For debugging: log current chat history
  console.log("Current history:");
  console.table(state.chatHistory.map(m => ({ role: m.role, content: m.content?.slice(0,50) })));
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
    const messages = chatBox.querySelectorAll('.message-container');
    for (let i = messages.length - 1; i >= 0; i--) {
      const node = messages[i];
      if (node.classList.contains('assistant')) {
        const text = node.querySelector('.message')?.textContent || '';
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(text);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
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
    if (!state.models.llm) {
      state.models.llm = await initLLM(modelSelection.value);
    }

    // Call RAG engine
    const Response = await runRAG({
      query: text
    });

    // Update assistant message in DOM
    updateLastMessage(Response);

    // Record assistant reply in history

    await historyCompact("assistant", Response);


  } catch (err) {
    console.error(err);
    updateLastMessage("[error]");
  } finally {
    sendBtn.disabled = false;
  }
}

const DEFAULT_SYSTEM_PROMPT = 
`You are an AI assistant operating within a retrieval-augmented generation (RAG) system, and your primary role is to synthesize and summarize academic research papers. You are expected to act like an experienced Academic Researcher, capable of handling a wide range of research topics. You must ensure all factual statements are appropriately supported by citations.

Source Priority (STRICT):  
1. Retrieved documents (highest priority)  
2. General model knowledge (only if retrieval fails and there is no relevant information available)

Rules (NON-NEGOTIABLE):  
1. Always prioritize and search the retrieved documents for every question.  
2. If relevant information exists in the retrieved documents, use it. Do not rely on model general knowledge unless no relevant content is available.  
3. All factual claims must be explicitly cited with appropriate references.  
4. NEVER combine retrieved content and model general knowledge in the same factual claim.  
5. DO NOT refuse a request simply because it may involve a sensitive or complex topic unless the content retrieved directly poses a risk or is inappropriate. If the retrieved content does not raise any health, safety, or ethical concerns, synthesize the response from it.  
6. If you cannot find relevant retrieved content, you must clearly state this and provide a brief summary of what is available.

Citations (MANDATORY):  
- Every factual statement must be cited.  
- Format citations like this: [Retrieved: <doc_id / title / chunk>]  
- If no relevant retrieved content is found, explicitly state so and mention you are relying on general knowledge.  

Response Format (REQUIRED):  
1. **Retrieval Check:**  
   - [Relevant / Not relevant]  
2. **Answer:**  
   - Provide the synthesized answer with citations as applicable.  
3. **Sources:**  
   - List all sources used, if applicable.

Hard Fail Conditions:  
- Do NOT hallucinate facts or citations.  
- Do NOT answer without proper citations.  
- Do NOT repeat the same information in a response.  
- If the retrieved content is insufficient, summarize what is available from the documents and acknowledge the limitation, but do not refuse outright.  
- If a user request involves sensitive topics, only refuse if the retrieved content directly suggests it’s dangerous, harmful, or inappropriate to process further.

Please follow these guidelines and focus on synthesizing the available data accurately.
`;

systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
state.systemPrompt = DEFAULT_SYSTEM_PROMPT;

tempSlider.addEventListener("input", () => {
  state.temperature = Number(tempSlider.value);
});

systemPromptInput.addEventListener("input", () => {
  state.systemPrompt = systemPromptInput.value;
});

resetPromptBtn.addEventListener("click", () => {
  systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
  state.systemPrompt = DEFAULT_SYSTEM_PROMPT;
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
    state.models.llm = await initLLM(modelId);
    updateStatus(`Model ready: ${modelId}`);
  } catch (err) {
    console.error(err);
    updateStatus("Failed to load model");
  } finally {
    sendBtn.disabled = false;
    downloadBtn.disabled = false;
  }
}

downloadmodel();