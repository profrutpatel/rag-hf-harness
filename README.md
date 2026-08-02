# 🇮🇳 RAG Harness — India Geopolitics AI (GPU-Parallel Edition)

A fully rebuilt, high-performance iteration of the [rag-search-app](https://github.com/profrutpatel/rag-search-app). This version replaces Ollama with **direct HuggingFace Transformers inference**, bringing a **GPU-parallel harness engine** that runs simultaneous RAG (Retrieval-Augmented Generation) queries using all available VRAM for maximum throughput.

Powered by the custom LoRA fine-tuned model: [`ProfRutPatel/qwen3-india-geopolitics`](https://huggingface.co/ProfRutPatel/qwen3-india-geopolitics).

---

## ✨ Features and Enhancements

| Feature | Original App | This Version |
|---|---|---|
| **LLM backend** | Ollama (subprocess, slow) | HuggingFace Transformers + PEFT (VRAM optimized) |
| **Model** | Any Ollama model | `ProfRutPatel/qwen3-india-geopolitics` (LoRA + Base) |
| **Parallelism** | Single thread | N GPU replicas, asyncio pool (Harness Engine) |
| **Batch API** | ❌ None | ✅ `/api/harness` (Native batch inference) |
| **BM25 Search** | Scikit-learn (Compile errors) | Pure Python BM25 (High portability) |
| **LoRA merging** | ❌ None | ✅ `merge_and_unload()` for max generation speed |

---

## 📂 Project Files Breakdown

Here is a breakdown of the core files inside the repository and what they do:

### Backend Files
- `backend/app.py`: The main Flask server. Exposes the REST API endpoints (`/api/search`, `/api/harness`, `/api/health`, `/api/models`). It manages the routing between the web search and the AI engine.
- `backend/model_engine.py`: The core of the GPU-Parallel harness. It detects the amount of VRAM on the system, loads multiple replicas of the `Qwen3-0.6B` model, merges the LoRA adapter weights, and queues incoming API requests to whatever replica is free using `asyncio.Semaphore`.
- `backend/rag_pipeline.py`: The Decoupled RAG Pipeline. It queries DuckDuckGo, asynchronously scrapes the raw HTML from the top results using `BeautifulSoup`, and ranks the most relevant paragraphs using a custom, pure-Python BM25 scoring algorithm.
- `backend/requirements.txt`: The dependencies required for the backend, including `torch`, `transformers`, `peft`, `flask`, `beautifulsoup4`, and `duckduckgo-search`.

### Frontend Files
- `frontend/src/App.jsx`: The main React component rendering the Single Query Mode, complete with sleek Glassmorphism UI styling.
- `frontend/src/HarnessPanel.jsx`: The UI for the Harness Engine. Allows users to write multiple AI queries separated by commas and dispatches them simultaneously to the backend's GPU pool.
- `frontend/src/components/GPUStats.jsx`: A real-time monitoring component that polls `/api/health` and displays the currently active LLM, available GPU replicas, and the number of parallel workers.
- `frontend/src/index.css`: The Vanilla CSS styling system responsible for the modern dark mode aesthetics, dynamic animations, and responsive layout.

### Utility Scripts
- `start_backend.ps1`: A PowerShell bootstrapper that automatically creates a Python virtual environment (`.venv`), installs all dependencies via `pip`, and starts the Flask server.
- `start_frontend.ps1`: A PowerShell bootstrapper that installs NPM dependencies and starts the Vite frontend proxy on port `5173`.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11 or 3.12 (For PyTorch GPU acceleration).
- Node.js & npm (For the frontend).
- An NVIDIA GPU is highly recommended for full parallel harness capabilities. (If running on a CPU, the harness will sequentially queue batch queries).

### Running the Application

This repository comes with automated bootstrap scripts for Windows users.

1. **Start the Backend:**
   Open a terminal and run the backend bootstrap script. This will download the base model and the LoRA adapter (approx. 2GB).
   ```powershell
   .\start_backend.ps1
   ```
2. **Start the Frontend:**
   Open a second terminal and run the frontend bootstrap script.
   ```powershell
   .\start_frontend.ps1
   ```
3. **Open the App:**
   Navigate to `http://localhost:5173` in your web browser.

---

## ⚙️ How the Harness Engine Works

The **Harness Engine** is a high-throughput parallel processing system designed for intensive QA pipelines. 

Instead of waiting for a 10-second generation to finish before starting the next one, the Harness Engine (`model_engine.py`) determines how many copies of the model can fit into your GPU's VRAM. If your GPU has 8GB of VRAM and the model takes 2GB, the engine spawns **4 Replicas**. 

When you use the `/api/harness` endpoint (or the Harness Mode in the UI) and submit 10 queries, the engine instantly dispatches 4 queries to your GPU in parallel, while holding the remaining 6 in an asynchronous queue. As soon as a GPU replica finishes a query, the next one is immediately sent in.
