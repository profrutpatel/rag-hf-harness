"""
model_engine.py — GPU-Parallel Harness Engine
==============================================
Loads N replicas of ProfRutPatel/qwen3-india-geopolitics (Qwen3-0.6B + LoRA)
into GPU VRAM. Provides async parallel inference via a semaphore-guarded pool.

Parallel strategy
-----------------
• Each replica is a fully merged (LoRA weights baked in) model instance.
• Thread-safe: each inference thread holds exactly one replica from the pool.
• VRAM auto-detection: N = floor(free_vram / MODEL_VRAM_MB) capped at MAX_REPLICAS.
• asyncio + ThreadPoolExecutor: zero-overhead dispatch for concurrent HTTP requests.
"""

from __future__ import annotations

import asyncio
import logging
import queue
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import torch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_MODEL_ID = "Qwen/Qwen3-0.6B"
ADAPTER_MODEL_ID = "ProfRutPatel/qwen3-india-geopolitics"

# Measured float16 footprint for Qwen3-0.6B + LoRA merged (MB)
MODEL_VRAM_MB = 1_300          # ~1.3 GB per replica (conservative)
SYSTEM_RESERVE_MB = 512        # keep 512 MB free for CUDA overhead / KV cache
MAX_REPLICAS = 8               # hard cap regardless of VRAM

# Generation defaults
DEFAULT_MAX_NEW_TOKENS = 512
DEFAULT_TEMPERATURE = 0.7
DEFAULT_TOP_P = 0.9


# ---------------------------------------------------------------------------
# Replica loader
# ---------------------------------------------------------------------------

def _load_one_replica(device: str) -> tuple:
    """
    Load a single merged model + tokenizer onto `device`.
    Returns (model, tokenizer).

    LoRA adapter is merged and unloaded so:
    - no PEFT overhead per forward pass
    - model is fully stateless (safe for concurrent use once loaded)
    """
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel

    logger.info(f"Loading tokenizer from {BASE_MODEL_ID}")
    tokenizer = AutoTokenizer.from_pretrained(
        BASE_MODEL_ID,
        trust_remote_code=True,
        padding_side="left",
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    logger.info(f"Loading base model {BASE_MODEL_ID} on {device}")
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_ID,
        torch_dtype=torch.float16,
        trust_remote_code=True,
        device_map=device,
    )

    logger.info(f"Loading LoRA adapter {ADAPTER_MODEL_ID}")
    peft_model = PeftModel.from_pretrained(base, ADAPTER_MODEL_ID)

    logger.info("Merging LoRA weights (merge_and_unload) …")
    merged = peft_model.merge_and_unload()
    merged.eval()

    logger.info(f"Replica loaded on {device} ✓")
    return merged, tokenizer


# ---------------------------------------------------------------------------
# VRAM detection
# ---------------------------------------------------------------------------

def _detect_replica_count(device_index: int = 0) -> int:
    """Auto-detect how many replicas fit in available VRAM."""
    if not torch.cuda.is_available():
        logger.warning("CUDA not available — running 1 CPU replica (slow!)")
        return 1

    free_bytes, total_bytes = torch.cuda.mem_get_info(device_index)
    free_mb = (free_bytes - SYSTEM_RESERVE_MB * 1024 * 1024) / (1024 * 1024)
    n = max(1, min(MAX_REPLICAS, int(free_mb / MODEL_VRAM_MB)))

    logger.info(
        f"GPU {device_index}: {total_bytes/1024**3:.1f} GB total, "
        f"{free_mb:.0f} MB usable after reserve → {n} replica(s)"
    )
    return n


# ---------------------------------------------------------------------------
# ModelEngine
# ---------------------------------------------------------------------------

class ModelEngine:
    """
    Thread-safe pool of GPU model replicas.

    Usage
    -----
    engine = ModelEngine()               # loads replicas at startup
    answer = asyncio.run(engine.generate_async(prompt))
    results = asyncio.run(engine.execute_parallel(prompts))
    """

    def __init__(
        self,
        device: str = "auto",
        replica_override: Optional[int] = None,
    ):
        self._device = self._resolve_device(device)
        self._replica_count = replica_override or _detect_replica_count(
            int(self._device.split(":")[-1]) if "cuda:" in self._device else 0
        )

        self._pool: queue.Queue = queue.Queue()
        self._tokenizer = None          # shared (stateless)
        self._executor = ThreadPoolExecutor(max_workers=self._replica_count)
        self._lock = threading.Lock()
        self._load_replicas()

        # async semaphore created lazily (must be in the correct event loop)
        self._semaphore: Optional[asyncio.Semaphore] = None

        # stats
        self._total_requests = 0
        self._total_latency_ms = 0.0

        logger.info(
            f"ModelEngine ready: {self._replica_count} replica(s) on {self._device}"
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_device(device: str) -> str:
        if device == "auto":
            return "cuda:0" if torch.cuda.is_available() else "cpu"
        return device

    def _load_replicas(self):
        """Load all replicas sequentially (GPU memory allocation is serial)."""
        logger.info(f"Loading {self._replica_count} replica(s) …")
        first_model, tokenizer = _load_one_replica(self._device)
        self._tokenizer = tokenizer
        self._pool.put(first_model)

        for i in range(1, self._replica_count):
            logger.info(f"Loading replica {i+1}/{self._replica_count} …")
            model, _ = _load_one_replica(self._device)
            self._pool.put(model)

    def _get_semaphore(self) -> asyncio.Semaphore:
        """Return (or create) the asyncio semaphore for the running loop."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return None
        if self._semaphore is None or self._semaphore._loop is not loop:
            self._semaphore = asyncio.Semaphore(self._replica_count)
        return self._semaphore

    # ------------------------------------------------------------------
    # Core generation (blocking, called in thread)
    # ------------------------------------------------------------------

    def _generate_blocking(
        self,
        prompt: str,
        max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE,
        top_p: float = DEFAULT_TOP_P,
    ) -> dict:
        """
        Claim a replica from the pool, run generation, return it.
        Blocks until a replica is free.
        """
        t0 = time.perf_counter()
        model = self._pool.get(block=True)
        wait_ms = (time.perf_counter() - t0) * 1000

        try:
            t_gen = time.perf_counter()
            inputs = self._tokenizer(
                prompt,
                return_tensors="pt",
                truncation=True,
                max_length=2048,
            ).to(self._device)

            with torch.no_grad(), torch.autocast(
                device_type=self._device.split(":")[0], dtype=torch.float16
            ):
                output_ids = model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    do_sample=True,
                    pad_token_id=self._tokenizer.pad_token_id,
                    eos_token_id=self._tokenizer.eos_token_id,
                )

            # Decode only the newly generated tokens
            new_tokens = output_ids[0][inputs["input_ids"].shape[-1]:]
            text = self._tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

            gen_ms = (time.perf_counter() - t_gen) * 1000
            total_ms = wait_ms + gen_ms

            with self._lock:
                self._total_requests += 1
                self._total_latency_ms += total_ms

            return {
                "text": text,
                "wait_ms": round(wait_ms, 1),
                "gen_ms": round(gen_ms, 1),
                "total_ms": round(total_ms, 1),
                "tokens_generated": len(new_tokens),
            }

        finally:
            # Always return the replica to the pool
            self._pool.put(model)

    # ------------------------------------------------------------------
    # Public async API
    # ------------------------------------------------------------------

    async def generate_async(
        self,
        prompt: str,
        max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE,
        top_p: float = DEFAULT_TOP_P,
    ) -> dict:
        """
        Non-blocking async wrapper around _generate_blocking.
        Respects the replica semaphore for fair queuing.
        """
        sem = self._get_semaphore()
        loop = asyncio.get_running_loop()

        async def _run():
            return await loop.run_in_executor(
                self._executor,
                lambda: self._generate_blocking(prompt, max_new_tokens, temperature, top_p),
            )

        if sem:
            async with sem:
                return await _run()
        else:
            return await _run()

    async def execute_parallel(
        self,
        prompts: list[str],
        max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS,
        temperature: float = DEFAULT_TEMPERATURE,
        top_p: float = DEFAULT_TOP_P,
    ) -> list[dict]:
        """
        Execute all prompts in parallel, saturating all GPU replicas.
        Returns list of result dicts in the same order as input.

        Each result dict: { text, wait_ms, gen_ms, total_ms, tokens_generated }
        """
        t_wall = time.perf_counter()
        tasks = [
            self.generate_async(p, max_new_tokens, temperature, top_p)
            for p in prompts
        ]
        results = await asyncio.gather(*tasks)
        wall_ms = (time.perf_counter() - t_wall) * 1000

        return {
            "results": list(results),
            "wall_ms": round(wall_ms, 1),
            "throughput_qps": round(len(prompts) / (wall_ms / 1000), 2),
            "replica_count": self._replica_count,
        }

    # ------------------------------------------------------------------
    # Status / Diagnostics
    # ------------------------------------------------------------------

    def status(self) -> dict:
        """Return current engine health metrics."""
        gpu_info = {}
        if torch.cuda.is_available():
            device_idx = int(self._device.split(":")[-1]) if "cuda:" in self._device else 0
            free_bytes, total_bytes = torch.cuda.mem_get_info(device_idx)
            allocated = torch.cuda.memory_allocated(device_idx)
            gpu_info = {
                "device": torch.cuda.get_device_name(device_idx),
                "vram_total_mb": round(total_bytes / 1024**2, 1),
                "vram_free_mb": round(free_bytes / 1024**2, 1),
                "vram_used_mb": round((total_bytes - free_bytes) / 1024**2, 1),
                "vram_allocated_mb": round(allocated / 1024**2, 1),
            }

        avg_lat = (
            self._total_latency_ms / self._total_requests
            if self._total_requests > 0
            else 0
        )

        return {
            "model": ADAPTER_MODEL_ID,
            "base_model": BASE_MODEL_ID,
            "replica_count": self._replica_count,
            "pool_available": self._pool.qsize(),
            "device": self._device,
            "total_requests": self._total_requests,
            "avg_latency_ms": round(avg_lat, 1),
            "gpu": gpu_info,
        }
