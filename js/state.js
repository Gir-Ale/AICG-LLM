window.state = {
  documents: [],   // { filename, text }
  chunks: [],      // { text, source }
  vectorStore: [], // Phase 2

  chatHistory: [],

  models: 
  {
    embedder: null,
    llm: null
  },

  status: "Initializing...",

  temperature: 0.5,
  systemPrompt: "",
  tokens: 1024
};


state.lastCitations = {};

