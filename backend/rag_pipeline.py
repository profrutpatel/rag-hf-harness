"""
rag_pipeline.py — Decoupled RAG Pipeline (no LLM inside)
=========================================================
Steps:
  1. DuckDuckGo web search
  2. Parallel page content extraction (BeautifulSoup)
  3. BM25 similarity scoring → top-K sources
  4. Build context string  ← caller passes this to ModelEngine

The LLM generation is intentionally NOT here — it lives in app.py
so the harness can batch multiple contexts through the GPU pool.
"""

from __future__ import annotations

import logging
import re
import concurrent.futures
from urllib.parse import urlparse
import math
from collections import Counter

import requests
from bs4 import BeautifulSoup
from ddgs import DDGS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. DuckDuckGo Web Search
# ---------------------------------------------------------------------------

def search_duckduckgo(query: str, max_results: int = 10) -> list[dict]:
    """
    Search DuckDuckGo and return raw results.
    Each result dict has: title, href, body (snippet).
    """
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        logger.info(f"DuckDuckGo: {len(results)} results for '{query}'")
        return results
    except Exception as e:
        logger.error(f"DuckDuckGo search failed: {e}")
        return []


# ---------------------------------------------------------------------------
# 2. Page Content Extraction
# ---------------------------------------------------------------------------

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )
}


def _clean_text(raw: str) -> str:
    """Collapse whitespace and cap per-page content."""
    text = re.sub(r"\s+", " ", raw)
    return text.strip()[:3000]


def fetch_page_content(url: str, timeout: int = 8) -> str:
    """
    Fetch a URL and return cleaned text content.
    Returns empty string on failure.
    """
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=timeout, allow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript"]):
            tag.decompose()

        main = soup.find("main") or soup.find("article") or soup.find("div", {"role": "main"})
        text = main.get_text(separator=" ") if main else soup.get_text(separator=" ")
        return _clean_text(text)
    except Exception as e:
        logger.warning(f"Failed to fetch {url}: {e}")
        return ""


def fetch_all_pages(results: list[dict], max_workers: int = 6) -> list[dict]:
    """
    Fetch page content for all results in parallel using a thread pool.
    Adds 'content' and 'domain' keys to each result dict.
    """
    def _enrich(r):
        url = r.get("href", "")
        content = fetch_page_content(url) if url else ""
        domain = urlparse(url).netloc if url else ""
        return {**r, "content": content, "domain": domain}

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        enriched = list(pool.map(_enrich, results))

    return [r for r in enriched if r.get("content")]


# ---------------------------------------------------------------------------
# 3. BM25 Relevancy Scoring (Pure Python)
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    return [w for w in re.findall(r'\w+', text.lower()) if len(w) > 2]

def score_and_rank(query: str, results: list[dict], top_k: int = 5) -> list[dict]:
    """
    Rank results by BM25 similarity to the query.
    Returns top_k results with a 'relevance_score' field.
    """
    if not results:
        return []

    query_tokens = _tokenize(query)
    if not query_tokens:
        return results[:top_k]

    N = len(results)
    df = Counter()
    doc_tokens = []
    for r in results:
        tokens = _tokenize(r.get("content", r.get("body", "")))
        doc_tokens.append(tokens)
        for w in set(tokens):
            df[w] += 1

    # BM25 IDF
    idf = {w: math.log((N - df.get(w, 0) + 0.5) / (df.get(w, 0) + 0.5) + 1.5) for w in query_tokens}
    avgdl = max(sum(len(d) for d in doc_tokens) / max(N, 1), 1)
    
    k1, b = 1.5, 0.75
    scored = []
    
    max_score = 0.0
    for i, r in enumerate(results):
        tokens = doc_tokens[i]
        tf = Counter(tokens)
        doc_len = len(tokens)
        
        score = 0.0
        for w in query_tokens:
            if w in tf:
                freq = tf[w]
                score += idf[w] * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * doc_len / avgdl))
        
        max_score = max(max_score, score)
        scored.append((score, r))
        
    ranked = sorted(scored, key=lambda x: x[0], reverse=True)[:top_k]
    
    out = []
    for s, r in ranked:
        normalized = s / max_score if max_score > 0 else 0.0
        out.append({**r, "relevance_score": round(normalized, 4)})
    return out


# ---------------------------------------------------------------------------
# 4. Context Builder
# ---------------------------------------------------------------------------

def build_context(sources: list[dict]) -> str:
    """
    Build the RAG context string from scored sources.
    This is injected into the LLM system prompt.
    """
    parts = []
    for i, s in enumerate(sources, 1):
        title = s.get("title", "Untitled")
        url = s.get("href", "")
        content = s.get("content") or s.get("body", "")
        parts.append(f"[Source {i}] {title}\nURL: {url}\n{content[:1500]}")
    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# 5. Top-level Pipeline (returns context + sources — no LLM call)
# ---------------------------------------------------------------------------

def run_rag_pipeline(
    query: str,
    max_search_results: int = 5,
    top_k_sources: int = 3,
) -> tuple[str, list[dict]]:
    """
    Run the full retrieval pipeline for a query.

    Returns
    -------
    context : str
        Formatted context string ready to inject into the LLM prompt.
    sources : list[dict]
        Ranked source dicts with relevance_score, title, domain, href.
    """
    # Step 1: Search
    raw = search_duckduckgo(query, max_results=max_search_results)
    if not raw:
        return "", []

    # Step 2: Fetch content in parallel
    enriched = fetch_all_pages(raw)

    # Step 3: Score and rank
    sources = score_and_rank(query, enriched, top_k=top_k_sources)

    # Step 4: Build context
    context = build_context(sources)

    return context, sources
