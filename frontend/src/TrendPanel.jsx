import React, { useState } from 'react'
import SourceCard from './components/SourceCard'

export default function TrendPanel() {
  const [queryInput, setQueryInput] = useState('')
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeKeywordIndex, setActiveKeywordIndex] = useState(0)

  const fetchTrends = async () => {
    if (!queryInput.trim()) {
      setError('Please input keyword(s) to track.')
      return
    }

    setLoading(true)
    setError('')
    setTrends([])

    try {
      const resp = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryInput }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(errText || 'Failed to fetch trends from backend')
      }

      const data = await resp.json()
      if (data.trends && data.trends.length > 0) {
        setTrends(data.trends)
        setActiveKeywordIndex(0)
      } else {
        setError('No trending data could be extracted for these keywords.')
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'An error occurred while tracking trends.')
    } finally {
      setLoading(false)
    }
  }

  // Generates SVG coordinates from trending data points
  const renderSVGLine = (history) => {
    const width = 500
    const height = 150
    const padding = 20
    const maxVal = 100

    const points = history.map((val, idx) => {
      const x = (idx / (history.length - 1)) * (width - padding * 2) + padding
      const y = height - (val / maxVal) * (height - padding * 2) - padding
      return { x, y }
    })

    const linePath = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`
    }, '')

    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-svg">
        <defs>
          <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        <line x1="20" y1="20" x2="480" y2="20" stroke="rgba(255,255,255,0.05)" />
        <line x1="20" y1="75" x2="480" y2="75" stroke="rgba(255,255,255,0.05)" />
        <line x1="20" y1="130" x2="480" y2="130" stroke="rgba(255,255,255,0.05)" />
        
        {/* Gradient fill */}
        <path d={areaPath} fill="url(#chartGlow)" />
        
        {/* Main trend line */}
        <path d={linePath} fill="none" stroke="#818cf8" strokeWidth="3" className="animated-path" />
        
        {/* Dots */}
        {points.map((p, idx) => (
          <g key={idx}>
            <circle cx={p.x} cy={p.y} r="5" fill="#818cf8" />
            <circle cx={p.x} cy={p.y} r="8" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.5" />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#a5b4fc" fontSize="10">
              {history[idx]}%
            </text>
          </g>
        ))}
      </svg>
    )
  }

  const activeTrend = trends[activeKeywordIndex]

  return (
    <div className="workspace-panel glass-card">
      <div className="panel-header">
        <h2>📈 Geopolitics & Policy Trend Tracker</h2>
        <p className="panel-subtitle">Analyze interest scores, media sentiment, and extracted themes for critical keywords.</p>
      </div>

      <div className="search-bar-row">
        <input
          type="text"
          placeholder="Enter keyword(s) to analyze (e.g. Quad alliance, India chip scheme, G20 policy)..."
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchTrends()}
        />
        <button className="btn btn-primary" onClick={fetchTrends} disabled={loading}>
          {loading ? 'Analyzing Trends...' : 'Check Trends'}
        </button>
      </div>

      {error && <div className="error-box" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading && (
        <div className="verdict-placeholder glass-card loading-animation" style={{ height: '300px' }}>
          <div className="spinner"></div>
          <p>Evaluating search frequencies, media coverage, and public sentiment...</p>
        </div>
      )}

      {!loading && trends.length === 0 && (
        <div className="verdict-placeholder glass-card" style={{ height: '300px' }}>
          <span>📊</span>
          <p>Enter keywords above to start tracking geopolitical trends.</p>
        </div>
      )}

      {trends.length > 0 && activeTrend && (
        <div className="trends-container">
          {/* Tag Selector */}
          <div className="keyword-selector-tabs">
            {trends.map((t, idx) => (
              <button
                key={idx}
                className={`keyword-tab glass-card ${idx === activeKeywordIndex ? 'active' : ''}`}
                onClick={() => setActiveKeywordIndex(idx)}
              >
                <span className="keyword-name">{t.keyword}</span>
                <span className="keyword-score">Score: {t.trend_score}</span>
              </button>
            ))}
          </div>

          <div className="trend-details-grid">
            {/* Left Graph Card */}
            <div className="trend-card glass-card graph-card">
              <h4>Interest Velocity (Last 7 Days)</h4>
              <div className="chart-wrapper">
                {renderSVGLine(activeTrend.trend_history)}
              </div>
              <div className="chart-labels">
                <span>7 Days Ago</span>
                <span>4 Days Ago</span>
                <span>Today</span>
              </div>
            </div>

            {/* Right Sentiment & Themes Card */}
            <div className="trend-card glass-card insights-card">
              <h4>Media Sentiment Breakdown</h4>
              <div className="sentiment-bar-container">
                <div className={`sentiment-indicator ${activeTrend.sentiment.toLowerCase()}`}>
                  <span className="sentiment-label">Overall Sentiment</span>
                  <span className="sentiment-value">{activeTrend.sentiment}</span>
                </div>
                
                <div className="sentiment-spectrum">
                  <div className="color-strip"></div>
                  <div className={`pointer ${activeTrend.sentiment.toLowerCase()}`}></div>
                </div>
              </div>

              <h4>Key Themes & Takeaways</h4>
              <ul className="themes-list">
                {activeTrend.themes.map((theme, i) => (
                  <li key={i}>{theme}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sources Section */}
          <div className="evidence-section" style={{ marginTop: '2rem' }}>
            <h3>Evidence & Search Sources Analyzed</h3>
            <div className="sources-list">
              {activeTrend.sources.map((s) => (
                <SourceCard key={s.index} source={s} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
