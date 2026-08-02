import React, { useState } from 'react'

/**
 * SourceCard — displays a single retrieved web source with
 * animated TF-IDF relevancy bar.
 */
export default function SourceCard({ source, index, delay = 0 }) {
  const [expanded, setExpanded] = useState(false)

  const pct = Math.round((source.relevance_score || 0) * 100)
  const barWidth = `${Math.min(100, pct * 3)}%`  // scale 0-33% → 0-100%

  return (
    <div
      className="source-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="source-header">
        <div>
          <div className="source-title">{source.title || 'Untitled'}</div>
          <div className="source-domain">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {source.domain || source.url}
            </a>
          </div>
        </div>
        <span className="source-index">[{index}]</span>
      </div>

      <div
        className={`source-snippet ${expanded ? '' : ''}`}
        style={expanded ? { WebkitLineClamp: 'unset', maxHeight: 'none' } : {}}
      >
        {source.snippet}
      </div>

      {source.snippet && source.snippet.length > 140 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-accent)', fontSize: '11px', padding: '4px 0',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {expanded ? '▲ Less' : '▼ More'}
        </button>
      )}

      <div className="relevance-bar-wrap">
        <span className="relevance-label">Relevance</span>
        <div className="relevance-bar-bg">
          <div
            className="relevance-bar-fill"
            style={{ width: barWidth, transitionDelay: `${delay + 100}ms` }}
          />
        </div>
        <span className="relevance-pct">{pct}%</span>
      </div>
    </div>
  )
}
