**Local LLM Literature Reviewer** is a WebLLM-based app that allows the user to chat with a localy hosted AI agent.
The entire system runs on the user's machine, allowing total privacy when sending sensitive documents to the agent.

**Demo: https://gir-ale.github.io/AICG-LLM/**

The whole system is built with RAG (Retrieval Augmented Generation) in mind, so you can rapidly give PDFs to the agent in order for it to analyze them and use them in its responses.
The user can choose their ideal AI model from the WebLLM catalog and press DOWNLOAD to begin using it, or you can directly use the app with the default: Llama-3.2-3B-Instruct-q4f32_1-MLC model.

The user has access to a temperature slider to change how original the AI has the right to be.
The user can choose the maximum amount of tokens the agent can use in order to get more in-depth results at the cost of time.
The user can also change the system prompt in real time in order to change how the AI behaves.

## Local Development

To host the app locally:

1. Clone the project from GitHub.  
2. **If you are on Windows (Chrome):** run the `test.bat` file.  
3. **Otherwise:**  
   - Open a terminal in the project directory.  
   - Run:  
     python -m http.server
   - Then go to:  
     **http://localhost:8000/index.html** to access the web app.

##

![Enregistrementdelcran2025-12-27142337-ezgif com-optimize](https://github.com/user-attachments/assets/81809358-1f6c-451c-84e6-3acdf036b735)
