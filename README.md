# 🇮🇳 RAG Harness — India Geopolitics AI (Super Intelligence Edition)

A fully rebuilt, production-grade iteration of the [rag-search-app](https://github.com/profrutpatel/rag-search-app). This version replaces Ollama with **direct HuggingFace Transformers inference**, adds a **GPU-parallel harness engine**, a **Super Intelligence Fact Checker** with browser-side OCR, and a **Geopolitics Trend Tracker** with live sentiment analysis.

Powered by the custom LoRA fine-tuned model: [`ProfRutPatel/qwen3-india-geopolitics`](https://huggingface.co/ProfRutPatel/qwen3-india-geopolitics).

---

## ✨ Features & Enhancements

| Feature | Original App | This Version |
|---|---|---|
| **LLM Backend** | Ollama (subprocess) | HuggingFace Transformers + PEFT |
| **Model** | Any Ollama model | `ProfRutPatel/qwen3-india-geopolitics` (LoRA) |
| **Parallelism** | Single thread | N GPU replicas, asyncio pool |
| **Batch API** | ❌ | ✅ `/api/harness` |
| **Fact Checking** | ❌ | ✅ `/api/fact-check` with TRUE/FALSE/MISLEADING verdict |
| **Trend Analysis** | ❌ | ✅ `/api/trends` with sentiment + interest scoring |
| **OCR Upload** | ❌ | ✅ Drag & drop image → Tesseract.js browser OCR |
| **BM25 Search** | Scikit-learn | Pure Python (no compile errors) |
| **LoRA merging** | ❌ | ✅ `merge_and_unload()` for max inference speed |

---

## 🚀 Four Intelligent Modes

### 🔍 Search Mode (RAG Q&A)
Ask anything about India's geopolitics, economy, or strategic policy. The system does a live DuckDuckGo search, ranks the top sources with BM25, and generates a grounded answer using the Qwen3 LoRA model.

### ⚡ Harness Mode (GPU-Parallel Batch)
Submit multiple queries at once. The harness engine dispatches all queries simultaneously to available GPU replicas and streams all results back in one response. Designed for intensive research pipelines.

### 🛡️ Fact Checker (OCR + LLM Verdict)
Paste a claim or **drag and drop a screenshot / news image**. Tesseract.js extracts text directly in the browser. The claim is then verified against live web sources and the model delivers a structured ruling:
- 🟢 **TRUE** — Supported by evidence
- 🔴 **FALSE** — Contradicted by evidence
- 🟡 **MISLEADING** — Partially accurate or out of context
- ⚪ **UNVERIFIED** — Insufficient information found

### 📈 Trend Tracker (Keyword Sentiment Analysis)
Enter one or more keywords (e.g. "Quad alliance, semiconductor policy"). The system queries live news sources, scores interest velocity over the past 7 days, and uses the LLM to extract:
- Overall media sentiment (POSITIVE / NEUTRAL / NEGATIVE)
- Key themes and debate topics
- An animated SVG interest chart

---

## 📂 Project Files Breakdown

### Backend (`backend/`)

| File | Description |
|------|-------------|
| `app.py` | Main Flask server. Defines all API routes: `/search`, `/harness`, `/fact-check`, `/trends`, `/health`, `/models`. Contains specialized LLM prompt templates for each mode. |
| `model_engine.py` | GPU-parallel ModelEngine. Detects VRAM, loads N replicas of the Qwen3 base + LoRA adapter, merges weights with `merge_and_unload()`, and uses `asyncio.Semaphore` to gate concurrent generation. |
| `rag_pipeline.py` | Decoupled retrieval pipeline. DuckDuckGo search → parallel page scraping (BeautifulSoup) → pure-Python BM25 scoring → context builder. Returns context without calling the LLM. |
| `requirements.txt` | All Python dependencies: `torch`, `transformers`, `peft`, `flask`, `flask-cors`, `beautifulsoup4`, `duckduckgo-search`, `requests`. |

### Frontend (`frontend/src/`)

| File | Description |
|------|-------------|
| `App.jsx` | Main app shell. Contains health polling, tab navigation (Search / Harness / Fact Check / Trends), typing animation hook, and the Search Mode UI. |
| `HarnessPanel.jsx` | Harness Mode UI. Multi-query textarea, live parallel result cards with per-query timing, and harness throughput stats. |
| `FactCheckerPanel.jsx` | Fact Checker UI. Drag-and-drop dropzone with Tesseract.js OCR progress bar, editable claim textarea, and structured verdict output card with glow badges. |
| `TrendPanel.jsx` | Trend Tracker UI. Keyword tag selector, animated custom SVG line chart (interest over time), sentiment spectrum slider, and AI-extracted theme bullets. |
| `components/GPUStats.jsx` | Real-time GPU/CPU monitor. Polls `/api/health` and displays replica count, device, and request stats. |
| `components/SourceCard.jsx` | Reusable source result card with title, domain, relevance score bar, and snippet. |
| `index.css` | Complete Vanilla CSS design system: dark glassmorphism, animated SVG charts, verdict glow badges, progress bars, dropzone styling, sentiment spectrum, and responsive layout. |

### Scripts

| File | Description |
|------|-------------|
| `start_backend.ps1` | PowerShell bootstrap: creates `.venv`, installs dependencies, starts Flask on port `5000`. |
| `start_frontend.ps1` | PowerShell bootstrap: installs npm packages, starts Vite dev server on port `5173`. |

---

## ⚙️ How the Harness Engine Works

The **Harness Engine** (`model_engine.py`) detects your GPU's VRAM and loads as many model replicas as will fit. Each replica is a fully merged copy of the base model + LoRA weights, ready for concurrent generation.

When `/api/harness` receives 10 queries and you have 4 replicas, it:
1. Runs all 10 RAG retrievals in parallel (I/O-bound, thread pool)
2. Dispatches 4 LLM generations simultaneously (one per replica)
3. Queues the remaining 6 and dispatches each as a replica frees up
4. Returns all 10 results in one JSON response

---

## 🏗️ Getting Started

### Prerequisites
- Python 3.11 or 3.12 (recommended for full GPU acceleration via PyTorch CUDA)
- Node.js & npm
- NVIDIA GPU (optional but recommended — falls back to CPU gracefully)

### Running Locally

1. **Start the Backend** (downloads ~2GB of model weights on first run):
   ```powershell
   .\start_backend.ps1
   ```

2. **Start the Frontend** (in a second terminal):
   ```powershell
   .\start_frontend.ps1
   ```

3. **Open the App:**
   Navigate to [`http://localhost:5173`](http://localhost:5173)

---

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Engine status, replica count, GPU info |
| `/api/models` | GET | Loaded model info and LoRA metadata |
| `/api/search` | POST | Single RAG query → `{query, answer, sources, timing}` |
| `/api/harness` | POST | Batch parallel queries → `{results[], harness_stats}` |
| `/api/fact-check` | POST | Claim verification → `{verdict: {ruling, confidence, summary, analysis}, sources}` |
| `/api/trends` | POST | Keyword trend analysis → `{trends: [{keyword, sentiment, themes, trend_score, trend_history}]}` |
