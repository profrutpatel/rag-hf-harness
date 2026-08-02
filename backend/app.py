"""
app.py — Flask Backend for GPU-Parallel RAG Harness
====================================================
Endpoints:
  GET  /api/health    → engine + GPU status
  GET  /api/models    → model info
  POST /api/search    → single RAG query (retrieval + LLM)
  POST /api/harness   → N parallel RAG queries (harness mode)
"""

from __future__ import annotations

import asyncio
import logging
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

from model_engine import ModelEngine
from rag_pipeline import run_rag_pipeline

# ---------------------------------------------------------------------------
# App Setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
])

# ---------------------------------------------------------------------------
# Boot — load GPU model pool at startup
# ---------------------------------------------------------------------------

logger.info("Initialising GPU ModelEngine …")
engine = ModelEngine()
logger.info("ModelEngine ready.")

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are a research assistant specializing in Indian geopolitics, policy, economy, and strategic affairs.
You have been given context from web sources retrieved for the user's query.

INSTRUCTIONS:
- Answer the user's question using the provided context.
- Cite your sources by referring to [Source 1], [Source 2], etc.
- If the context doesn't contain enough information, draw on your training knowledge but say so.
- Be concise, accurate, and well-structured.
- Use markdown formatting for better readability.

CONTEXT:
{context}
"""

def build_prompt(query: str, context: str) -> str:
    system = SYSTEM_PROMPT.format(context=context)
    return (
        f"### System:\n{system}\n\n"
        f"### Instruction:\n{query}\n\n"
        f"### Response:\n"
    )


# ---------------------------------------------------------------------------
# Helper — format source for API response
# ---------------------------------------------------------------------------

def _format_source(s: dict, idx: int) -> dict:
    return {
        "index": idx,
        "title": s.get("title", "Untitled"),
        "url": s.get("href", ""),
        "domain": s.get("domain", ""),
        "snippet": s.get("body", "")[:300],
        "relevance_score": s.get("relevance_score", 0.0),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health_check():
    """Engine and GPU health."""
    status = engine.status()
    return jsonify({
        "status": "healthy",
        "engine": status,
    })


@app.route("/api/models", methods=["GET"])
def list_models():
    """Return info about the loaded HuggingFace model."""
    from model_engine import BASE_MODEL_ID, ADAPTER_MODEL_ID
    return jsonify({
        "models": [
            {
                "id": ADAPTER_MODEL_ID,
                "name": "Qwen3-0.6B — India Geopolitics LoRA",
                "base": BASE_MODEL_ID,
                "description": (
                    "LoRA fine-tune of Qwen3-0.6B on Indian geopolitics, "
                    "domestic policies, economy, and strategic affairs."
                ),
                "parameters": "0.6B",
                "precision": "float16",
                "lora_rank": 16,
            }
        ],
        "active_model": ADAPTER_MODEL_ID,
        "replica_count": engine.status()["replica_count"],
    })


@app.route("/api/search", methods=["POST"])
def search():
    """
    Single RAG query.

    Body: { "query": "...", "max_new_tokens": 512 }
    """
    body = request.get_json(silent=True) or {}
    query = (body.get("query") or "").strip()
    if not query:
        return jsonify({"error": "query is required"}), 400

    max_new_tokens = int(body.get("max_new_tokens", 512))
    temperature = float(body.get("temperature", 0.7))

    t0 = time.perf_counter()

    # 1. Retrieval
    context, sources = run_rag_pipeline(query)

    # 2. Build prompt
    prompt = build_prompt(query, context)

    # 3. GPU generation (async → sync bridge)
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            engine.generate_async(prompt, max_new_tokens=max_new_tokens, temperature=temperature)
        )
    finally:
        loop.close()

    wall_ms = round((time.perf_counter() - t0) * 1000, 1)

    return jsonify({
        "query": query,
        "answer": result["text"],
        "sources": [_format_source(s, i + 1) for i, s in enumerate(sources)],
        "timing": {
            "total_ms": wall_ms,
            "retrieval_ms": round(wall_ms - result["total_ms"], 1),
            "generation_ms": result["gen_ms"],
            "queue_wait_ms": result["wait_ms"],
            "tokens_generated": result["tokens_generated"],
        },
    })


@app.route("/api/harness", methods=["POST"])
def harness():
    """
    Parallel harness — run N queries simultaneously using all GPU replicas.

    Body:
    {
      "queries": ["query 1", "query 2", ...],
      "max_new_tokens": 512,
      "temperature": 0.7
    }

    Response:
    {
      "results": [
        { "query", "answer", "sources", "timing" },
        ...
      ],
      "harness_stats": {
        "total_queries": N,
        "wall_ms": ...,
        "throughput_qps": ...,
        "replica_count": ...
      }
    }
    """
    body = request.get_json(silent=True) or {}
    queries = body.get("queries") or []

    if not queries or not isinstance(queries, list):
        return jsonify({"error": "queries must be a non-empty list"}), 400

    queries = [q.strip() for q in queries if isinstance(q, str) and q.strip()]
    if not queries:
        return jsonify({"error": "no valid queries provided"}), 400

    max_new_tokens = int(body.get("max_new_tokens", 512))
    temperature = float(body.get("temperature", 0.7))

    t_wall = time.perf_counter()
    logger.info(f"Harness: running {len(queries)} queries in parallel …")

    # -------------------------------------------------------------------
    # Step 1: Retrieval for all queries in parallel (thread pool, I/O bound)
    # -------------------------------------------------------------------
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(queries), 8)) as pool:
        pipeline_futures = {pool.submit(run_rag_pipeline, q): q for q in queries}
        pipeline_results = {}
        for fut in concurrent.futures.as_completed(pipeline_futures):
            q = pipeline_futures[fut]
            try:
                pipeline_results[q] = fut.result()
            except Exception as e:
                logger.error(f"Pipeline failed for '{q}': {e}")
                pipeline_results[q] = ("", [])

    # -------------------------------------------------------------------
    # Step 2: Build prompts
    # -------------------------------------------------------------------
    prompts = [build_prompt(q, pipeline_results[q][0]) for q in queries]

    # -------------------------------------------------------------------
    # Step 3: GPU generation — all prompts in parallel across replicas
    # -------------------------------------------------------------------
    loop = asyncio.new_event_loop()
    try:
        batch_result = loop.run_until_complete(
            engine.execute_parallel(prompts, max_new_tokens=max_new_tokens, temperature=temperature)
        )
    finally:
        loop.close()

    total_wall_ms = round((time.perf_counter() - t_wall) * 1000, 1)

    # -------------------------------------------------------------------
    # Step 4: Assemble response
    # -------------------------------------------------------------------
    gen_results = batch_result["results"]
    response_items = []
    for i, q in enumerate(queries):
        _, sources = pipeline_results.get(q, ([], []))
        gen = gen_results[i] if i < len(gen_results) else {}
        response_items.append({
            "query": q,
            "answer": gen.get("text", ""),
            "sources": [_format_source(s, j + 1) for j, s in enumerate(sources)],
            "timing": {
                "gen_ms": gen.get("gen_ms", 0),
                "queue_wait_ms": gen.get("wait_ms", 0),
                "total_ms": gen.get("total_ms", 0),
                "tokens_generated": gen.get("tokens_generated", 0),
            },
        })

    return jsonify({
        "results": response_items,
        "harness_stats": {
            "total_queries": len(queries),
            "wall_ms": total_wall_ms,
            "throughput_qps": round(len(queries) / (total_wall_ms / 1000), 2),
            "replica_count": batch_result.get("replica_count", engine.status()["replica_count"]),
        },
    })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
