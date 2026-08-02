import React, { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Latency badge — colour-coded by response time.
 */
function LatencyBadge({ ms }) {
  const secs = ms / 1000
  const cls = secs < 5 ? 'fast' : secs < 15 ? 'medium' : 'slow'
  return (
    <span className={`hrc-latency ${cls}`}>{secs.toFixed(1)}s</span>
  )
}

/**
 * Single harness result card.
 */
function HarnessResultCard({ item, idx }) {
  const [showSources, setShowSources] = useState(false)

  return (
    <div className="harness-result-card" style={{ animationDelay: `${idx * 40}ms` }}>
      <div className="hrc-header">
        <div className="hrc-query" title={item.query}>
          {idx + 1}. {item.query}
        </div>
        {item.timing && <LatencyBadge ms={item.timing.total_ms} />}
      </div>

      <div className="hrc-answer">
        {item.loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
            <div className="spinner sm" />
            <span style={{ fontSize: 12 }}>Generating…</span>
          </div>
        ) : item.error ? (
          <span style={{ color: 'var(--accent-red)', fontSize: 12 }}>{item.error}</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {item.answer || ''}
          </ReactMarkdown>
        )}
      </div>

      {!item.loading && !item.error && (
        <div className="hrc-footer">
          <span>🔗 {item.sources?.length || 0} sources</span>
          {item.timing && (
            <>
              <span>·</span>
              <span>{item.timing.tokens_generated} tokens</span>
              <span>·</span>
              <span>gen {(item.timing.gen_ms / 1000).toFixed(1)}s</span>
            </>
          )}
          {item.sources?.length > 0 && (
            <>
              <span style={{ marginLeft: 'auto' }}>
                <button
                  onClick={() => setShowSources(s => !s)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--text-accent)',
                    cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)',
                  }}
                >
                  {showSources ? 'Hide sources ▲' : 'Show sources ▼'}
                </button>
              </span>
            </>
          )}
        </div>
      )}

      {showSources && item.sources?.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {item.sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11, color: 'var(--accent-3)',
                textDecoration: 'none', display: 'block',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              [{i + 1}] {s.title || s.url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * HarnessPanel — multi-query parallel execution UI.
 */
export default function HarnessPanel({ engineStatus }) {
  const [inputText, setInputText] = useState('')
  const [results, setResults]     = useState([])
  const [stats, setStats]         = useState(null)
  const [running, setRunning]     = useState(false)
  const [error, setError]         = useState('')
  const textareaRef = useRef(null)

  const queries = inputText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const replicaCount = engineStatus?.replica_count || 1

  async function runHarness() {
    if (!queries.length || running) return
    setRunning(true)
    setError('')
    setStats(null)

    // Optimistic loading state — show a card per query immediately
    setResults(queries.map(q => ({ query: q, loading: true })))

    try {
      const resp = await fetch('/api/harness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries, max_new_tokens: 80 }),
      })

      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.error || `HTTP ${resp.status}`)
      }

      const data = await resp.json()
      setResults(data.results)
      setStats(data.harness_stats)
    } catch (e) {
      setError(e.message)
      setResults(queries.map(q => ({ query: q, error: e.message })))
    } finally {
      setRunning(false)
    }
  }

  function loadExample() {
    setInputText(
      `What is India's nuclear doctrine and No First Use policy?\nExplain the significance of the Quad alliance in the Indo-Pacific\nHow did the 1991 economic reforms transform India?\nWhat is India's stance in the Galwan Valley dispute with China?\nDescribe ISRO's Chandrayaan missions and their strategic importance`
    )
  }

  return (
    <div className="harness-panel">

      {/* ---- Input ---- */}
      <div className="harness-input-wrap">
        <div className="harness-label">
          <span>⚡</span>
          Harness Mode
          <span className="harness-badge">GPU PARALLEL</span>
        </div>

        <textarea
          ref={textareaRef}
          className="harness-textarea"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={
            `Enter one query per line — all run simultaneously across ${replicaCount} GPU replica(s)\n\nExample:\nWhat is India's nuclear doctrine?\nExplain the Quad alliance\nHow did the 1991 reforms transform India?`
          }
          disabled={running}
        />

        <div className="harness-controls">
          <div className="harness-info">
            <strong>{queries.length}</strong> {queries.length === 1 ? 'query' : 'queries'} ·{' '}
            up to <strong>{replicaCount}</strong> run in parallel
          </div>

          <button
            onClick={loadExample}
            disabled={running}
            style={{
              background: 'rgba(255,255,255,.05)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              padding: '6px 12px',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'var(--transition)',
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            Load example
          </button>

          <button
            className="harness-run-btn"
            onClick={runHarness}
            disabled={running || queries.length === 0}
          >
            {running ? (
              <>
                <div className="spinner sm" style={{ borderTopColor: '#000' }} />
                Running {queries.length} queries…
              </>
            ) : (
              <>⚡ Run {queries.length > 0 ? queries.length : ''} Queries</>
            )}
          </button>
        </div>
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          {error}
        </div>
      )}

      {/* ---- Stats summary ---- */}
      {stats && !running && (
        <div className="harness-stats-card">
          <div className="h-stat">
            <span className="h-stat-label">Queries</span>
            <span className="h-stat-value">{stats.total_queries}</span>
          </div>
          <div className="h-stat">
            <span className="h-stat-label">Wall Time</span>
            <span className="h-stat-value">{(stats.wall_ms / 1000).toFixed(1)}s</span>
          </div>
          <div className="h-stat">
            <span className="h-stat-label">Throughput</span>
            <span className="h-stat-value">{stats.throughput_qps} q/s</span>
          </div>
          <div className="h-stat">
            <span className="h-stat-label">GPU Replicas</span>
            <span className="h-stat-value">{stats.replica_count}</span>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            ✅ All {stats.total_queries} queries completed in parallel
          </div>
        </div>
      )}

      {/* ---- Results Grid ---- */}
      {results.length > 0 && (
        <div className="harness-results-grid">
          {results.map((item, i) => (
            <HarnessResultCard key={`${item.query}-${i}`} item={item} idx={i} />
          ))}
        </div>
      )}

      {/* ---- Empty state ---- */}
      {results.length === 0 && !running && (
        <div className="empty-state">
          <div className="empty-state-icon">⚡</div>
          <div className="empty-state-title">Ready for Parallel Inference</div>
          <div className="empty-state-desc">
            Enter multiple queries (one per line) above. All queries will be dispatched
            simultaneously, saturating all {replicaCount} GPU replica{replicaCount !== 1 ? 's' : ''} at once.
          </div>
        </div>
      )}
    </div>
  )
}
