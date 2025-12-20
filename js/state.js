window.state = {
  documents: [],   // { filename, text }
  chunks: [],      // { text, source }
  vectorStore: [], // Phase 2

  chatHistory: [],

  models: {
    embedder: null,
    llm: null
  },

  status: "Initializing..."
};

state.controls = {
  temperature: 0.4,
  systemPrompt: ""
};

state.lastCitations = {};

