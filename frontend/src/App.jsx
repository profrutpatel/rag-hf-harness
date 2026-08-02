import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import GPUStats from './components/GPUStats.jsx'
import SourceCard from './components/SourceCard.jsx'
import HarnessPanel from './HarnessPanel.jsx'
import FactCheckerPanel from './FactCheckerPanel.jsx'
import TrendPanel from './TrendPanel.jsx'

// ---- typing animation hook ----
function useTypingEffect(text, speed = 12) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!text) { setDisplayed(''); setDone(false); return }
    setDisplayed('')
    setDone(false)
    let i = 0
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      i += Math.ceil(text.length / 300) + 1   // variable chunk speed
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(timerRef.current)
        setDisplayed(text)
        setDone(true)
      }
    }, speed)
    return () => clearInterval(timerRef.current)
  }, [text])

  return { displayed, done }
}

// ---- health polling ----
function useEngineHealth(intervalMs = 5000) {
  const [status, setStatus] = useState(null)
  const [healthy, setHealthy] = useState(null)

  const poll = useCallback(async () => {
    try {
      const r = await fetch('/api/health')
      const d = await r.json()
      setStatus(d.engine)
      setHealthy(true)
    } catch {
      setHealthy(false)
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, intervalMs)
    return () => clearInterval(id)
  }, [poll, intervalMs])

  return { status, healthy }
}

// ---- single query result panel ----
function SearchResult({ data, loading }) {
  const { displayed, done } = useTypingEffect(data?.answer || '', 8)

  if (loading) {
    return (
      <div className="response-panel">
        <div className="response-header">
          <div className="spinner" />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Searching the web &amp; generating answer…
          </span>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <>
      {/* ---- Answer ---- */}
      <div className="response-panel">
        <div className="response-header">
          <span style={{ fontSize: 18 }}>🤖</span>
          <span className="response-model-tag">Qwen3-India-Geopolitics</span>
          {data.timing && (
            <span className="response-timing">
              {(data.timing.total_ms / 1000).toFixed(1)}s total ·{' '}
              {data.timing.tokens_generated} tokens
            </span>
          )}
        </div>

        <div className={`response-body ${!done ? 'typing-cursor' : ''}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {displayed}
          </ReactMarkdown>
        </div>
      </div>

      {/* ---- Sources ---- */}
      {data.sources?.length > 0 && (
        <div className="sources-section">
          <div className="sources-title">
            <span>🔗</span>
            {data.sources.length} Sources
          </div>
          {data.sources.map((s, i) => (
            <SourceCard
              key={s.url || i}
              source={s}
              index={i + 1}
              delay={i * 60}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ---- main app ----
export default function App() {
  const [mode, setMode]           = useState('search')  // 'search' | 'harness'
  const [query, setQuery]         = useState('')
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const { status: engineStatus, healthy } = useEngineHealth(5000)

  async function handleSearch(e) {
    e?.preventDefault()
    const q = query.trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const resp = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, max_new_tokens: 120 }),
      })
      if (!resp.ok) {
        let errText = await resp.text()
        let errMsg = `HTTP ${resp.status}`
        try {
          const errObj = JSON.parse(errText)
          errMsg = errObj.error || errMsg
        } catch {
          errMsg = errText || errMsg
        }
        throw new Error(errMsg)
      }
      const data = await resp.json()
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Status dot logic
  const dotClass = healthy === null ? 'loading' : healthy ? '' : 'error'
  const dotLabel = healthy === null ? 'Connecting…' :
                   healthy          ? `${engineStatus?.replica_count || 1} replica${(engineStatus?.replica_count || 1) !== 1 ? 's' : ''} ready` :
                                      'Engine offline'

  return (
    <div className="app-layout">

      {/* ===== HEADER ===== */}
      <header className="header">
        <div className="header-inner">
          {/* Logo */}
          <div className="logo">
            <div className="logo-icon">🇮🇳</div>
            <div>
              <div className="logo-text">RAG Harness</div>
              <div className="logo-sub">India Geopolitics AI · GPU Parallel</div>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="mode-toggle">
            <button
              id="btn-mode-search"
              className={`mode-btn ${mode === 'search' ? 'active' : ''}`}
              onClick={() => setMode('search')}
            >
              🔍 Search
            </button>
            <button
              id="btn-mode-harness"
              className={`mode-btn ${mode === 'harness' ? 'active' : ''}`}
              onClick={() => setMode('harness')}
            >
              ⚡ Harness
            </button>
            <button
              id="btn-mode-factcheck"
              className={`mode-btn ${mode === 'factcheck' ? 'active' : ''}`}
              onClick={() => setMode('factcheck')}
            >
              🛡️ Fact Check
            </button>
            <button
              id="btn-mode-trends"
              className={`mode-btn ${mode === 'trends' ? 'active' : ''}`}
              onClick={() => setMode('trends')}
            >
              📈 Trends
            </button>
          </div>

          {/* Status */}
          <div className="header-status">
            <div className={`status-dot ${dotClass}`} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{dotLabel}</span>
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main>
        <div className="main-content">

          {/* GPU Stats bar */}
          {engineStatus && <GPUStats status={engineStatus} />}

          {/* ---- SEARCH MODE ---- */}
          {mode === 'search' && (
            <>
              <div className="search-section">
                <form className="search-bar-wrap" onSubmit={handleSearch}>
                  <span className="search-icon">🔍</span>
                  <input
                    id="search-input"
                    className="search-input"
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Ask anything about India's geopolitics, policy, economy…"
                    disabled={loading}
                    autoComplete="off"
                  />
                  <button
                    id="search-btn"
                    className="search-btn"
                    type="submit"
                    disabled={loading || !query.trim()}
                  >
                    {loading ? <><div className="spinner sm" style={{ borderTopColor: '#fff' }} /> Searching…</> : '→ Ask'}
                  </button>
                </form>

                {/* Quick examples */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    "India's nuclear No First Use doctrine",
                    "Quad alliance Indo-Pacific strategy",
                    "1991 economic liberalisation reforms",
                    "ISRO Chandrayaan-3 significance",
                  ].map(ex => (
                    <button
                      key={ex}
                      onClick={() => { setQuery(ex); }}
                      style={{
                        background: 'rgba(99,102,241,.1)',
                        border: '1px solid rgba(99,102,241,.2)',
                        borderRadius: '999px',
                        color: 'var(--text-accent)',
                        fontSize: 11,
                        padding: '4px 12px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        transition: 'var(--transition)',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,.2)'}
                      onMouseOut={e => e.currentTarget.style.background = 'rgba(99,102,241,.1)'}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="error-banner">
                  <span>⚠️</span> {error}
                </div>
              )}

              <SearchResult data={result} loading={loading} />

              {!loading && !result && !error && (
                <div className="empty-state">
                  <div className="empty-state-icon">🇮🇳</div>
                  <div className="empty-state-title">India Geopolitics RAG Assistant</div>
                  <div className="empty-state-desc">
                    Powered by <strong style={{ color: 'var(--text-accent)' }}>Qwen3-0.6B</strong> fine-tuned
                    on India's strategic affairs, policies &amp; economy. Ask anything — the assistant
                    retrieves live web sources and synthesises an answer using the LoRA-adapted model.
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{
                      background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.2)',
                      borderRadius: 'var(--radius-md)', padding: '6px 14px',
                      fontSize: 12, color: 'var(--accent-gold)',
                    }}>
                      ⚡ Switch to Harness Mode to run parallel batch queries
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---- HARNESS MODE ---- */}
          {mode === 'harness' && (
            <HarnessPanel engineStatus={engineStatus} />
          )}

          {/* ---- FACT CHECK MODE ---- */}
          {mode === 'factcheck' && (
            <FactCheckerPanel />
          )}

          {/* ---- TRENDS MODE ---- */}
          {mode === 'trends' && (
            <TrendPanel />
          )}

        </div>
      </main>
    </div>
  )
}
