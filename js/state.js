window.state = {
  documents: [],
  chunks: [],
  vectorStore: [],

  chatHistory: [],

  models: 
  {
    embedder: null,
    llm: null
  },

  status: "Initializing...",

  temperature: 0.5,
  systemPrompt: "",
  tokens: 2048
};


state.lastCitations = {};

