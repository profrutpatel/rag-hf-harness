# 🇮🇳 RAG Harness — India Geopolitics AI (GPU-Parallel Edition)

A rebuilt version of [rag-search-app](https://github.com/profrutpatel/rag-search-app) replacing Ollama with **direct HuggingFace Transformers** inference and adding a **GPU-parallel harness engine** that runs simultaneous queries using all available VRAM.

---

## ✨ What's New vs. Original

| Feature | Original | This Version |
|---|---|---|
| LLM backend | Ollama (subprocess) | HuggingFace Transformers + PEFT |
| Model | Any Ollama model | `ProfRutPatel/qwen3-india-geopolitics` |
| Parallelism | Single thread | N GPU replicas, asyncio pool |
| Batch API | ❌ | ✅ `/api/harness` |
| GPU stats | ❌ | ✅ Live VRAM bar |
| LoRA merging | ❌ | ✅ `merge_and_unload()` for max perf |

---

## 🏗️ Architecture

```
Frontend (React/Vite :5173)
├── Search Mode   → single query → /api/search
└── Harness Mode  → N queries   → /api/harness

Flask Backend (:5000)
├── /api/health   → engine + GPU status
├── /api/models   → HF model info
├── /api/search   → single RAG query
└── /api/harness  → N parallel RAG queries

RAG Pipeline (no LLM inside)
└── DuckDuckGo → BeautifulSoup → TF-IDF → context string

ModelEngine (GPU replica pool)
├── Auto-detects VRAM → loads N merged model replicas
├── asyncio.Semaphore pool → fair dispatch
└── ThreadPoolExecutor → zero-overhead GPU parallelism

GPU: Qwen3-0.6B + LoRA merged → ~1.3GB/replica at float16
  4 GB GPU → 2-3 replicas
  8 GB GPU → 5-6 replicas
 16 GB GPU → 10-12 replicas
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- CUDA-capable GPU (CPU fallback works, but very slow)
- Internet access (DuckDuckGo search)

### 1. Backend (GPU Engine)

Open **Terminal 1**:
```powershell
cd C:\Users\comed\.gemini\antigravity-ide\scratch\rag-hf-harness
.\start_backend.ps1
```

On first run:
1. Creates Python venv
2. Installs PyTorch + HuggingFace
3. Downloads `Qwen/Qwen3-0.6B` base model (~1.2 GB)
4. Downloads `ProfRutPatel/qwen3-india-geopolitics` LoRA adapter (~25 MB)
5. Merges LoRA weights + loads N replicas into GPU VRAM

**Startup takes 60–120 seconds** — you'll see:
```
ModelEngine ready: 2 replica(s) on cuda:0
 * Running on http://0.0.0.0:5000
```

### 2. Frontend

Open **Terminal 2**:
```powershell
.\start_frontend.ps1
```

Visit → **http://localhost:5173**

---

## 🔥 Using the Harness

1. Click **⚡ Harness** in the top nav
2. Enter one query per line (or click "Load example")
3. Click **⚡ Run N Queries**
4. All queries hit the GPU simultaneously — watch the result cards populate in real-time
5. Check throughput stats: wall time, queries/sec, replica count

### REST API (curl example)
```bash
curl -X POST http://localhost:5000/api/harness \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      "What is India'\''s nuclear doctrine?",
      "Explain the Quad alliance",
      "How did the 1991 reforms transform India?"
    ],
    "max_new_tokens": 300
  }'
```

---

## 📁 Project Structure

```
rag-hf-harness/
├── backend/
│   ├── app.py              Flask API (search + harness endpoints)
│   ├── model_engine.py     GPU replica pool + async parallel inference
│   ├── rag_pipeline.py     DuckDuckGo + TF-IDF (no LLM inside)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx         Main app (search/harness modes)
│   │   ├── HarnessPanel.jsx Multi-query parallel UI
│   │   ├── index.css       Dark glassmorphism design system
│   │   └── components/
│   │       ├── GPUStats.jsx  Live VRAM + replica stats bar
│   │       └── SourceCard.jsx Animated TF-IDF relevancy cards
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── start_backend.ps1
├── start_frontend.ps1
└── README.md
```

---

## ⚙️ Configuration

In `backend/model_engine.py`:

| Constant | Default | Description |
|---|---|---|
| `MODEL_VRAM_MB` | 1300 | Per-replica VRAM budget (MB) |
| `SYSTEM_RESERVE_MB` | 512 | Reserved for CUDA overhead |
| `MAX_REPLICAS` | 8 | Hard cap regardless of VRAM |
| `DEFAULT_MAX_NEW_TOKENS` | 512 | Max output length |

To force a specific replica count:
```python
engine = ModelEngine(replica_override=3)
```

---

## 🔬 Monitoring

```bash
# GPU utilization during harness run
nvidia-smi dmon -s u -d 1

# Engine health
curl http://localhost:5000/api/health | python -m json.tool
```
