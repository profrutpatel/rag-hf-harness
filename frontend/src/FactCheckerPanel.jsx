import React, { useState } from 'react'
import Tesseract from 'tesseract.js'
import SourceCard from './components/SourceCard'

export default function FactCheckerPanel() {
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('')
  const [claimText, setClaimText] = useState('')
  
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    processImage(file)
  }

  const processImage = (file) => {
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
    setOcrLoading(true)
    setOcrProgress(0)
    setOcrStatus('Initializing OCR engine...')
    setError('')

    Tesseract.recognize(
      file,
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrStatus('Extracting text...')
            setOcrProgress(Math.round(m.progress * 100))
          }
        }
      }
    )
      .then(({ data: { text } }) => {
        setClaimText(text.trim())
        setOcrStatus('Text successfully extracted!')
        setOcrLoading(false)
      })
      .catch((err) => {
        console.error('OCR Error:', err)
        setError('Failed to extract text from the image. Please try typing your claim instead.')
        setOcrLoading(false)
      })
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      processImage(file)
    } else {
      setError('Please drop a valid image file.')
    }
  }

  const checkClaim = async () => {
    if (!claimText.trim()) {
      setError('Please enter a claim or upload an image to extract text.')
      return
    }

    setChecking(true)
    setError('')
    setResult(null)

    try {
      const resp = await fetch('/api/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: claimText }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(errText || 'Server returned an error')
      }

      const data = await resp.json()
      setResult(data)
    } catch (err) {
      console.error(err)
      setError(err.message || 'An error occurred while verifying the claim.')
    } finally {
      setChecking(false)
    }
  }

  const clearAll = () => {
    setImage(null)
    setImagePreview(null)
    setClaimText('')
    setResult(null)
    setError('')
    setOcrProgress(0)
    setOcrStatus('')
  }

  const getRulingBadgeClass = (ruling) => {
    switch (ruling.toUpperCase()) {
      case 'TRUE':
        return 'verdict-badge bg-green-glow'
      case 'FALSE':
        return 'verdict-badge bg-red-glow'
      case 'MISLEADING':
        return 'verdict-badge bg-amber-glow'
      default:
        return 'verdict-badge bg-gray-glow'
    }
  }

  return (
    <div className="workspace-panel glass-card">
      <div className="panel-header">
        <h2>🛡️ Super Intelligence Fact Checker</h2>
        <p className="panel-subtitle">Upload policy documents, news clips, or write statements to cross-reference with live web data.</p>
      </div>

      <div className="fact-checker-grid">
        {/* Input Column */}
        <div className="input-section">
          <h3>1. Input Claim or Policy Statement</h3>
          
          <div
            className={`dropzone glass-card ${image ? 'has-file' : ''}`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {imagePreview ? (
              <div className="preview-container">
                <img src={imagePreview} alt="Claim preview" className="image-preview" />
                <button type="button" className="btn-clear-img" onClick={() => { setImage(null); setImagePreview(null); }}>
                  Remove Image
                </button>
              </div>
            ) : (
              <div className="dropzone-prompt">
                <span className="icon">📷</span>
                <p>Drag & drop image claim here, or <label className="file-label">browse<input type="file" onChange={handleImageChange} accept="image/*" className="file-input" /></label></p>
                <span className="hint">Extracts text automatically using Tesseract OCR</span>
              </div>
            )}
          </div>

          {ocrLoading && (
            <div className="ocr-progress-bar glass-card">
              <div className="progress-info">
                <span>{ocrStatus}</span>
                <span>{ocrProgress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${ocrProgress}%` }}></div>
              </div>
            </div>
          )}

          <div className="textarea-container">
            <label htmlFor="claim-textarea">Claim Text:</label>
            <textarea
              id="claim-textarea"
              placeholder="Paste extracted text here or type your statement manually..."
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              disabled={ocrLoading}
            />
          </div>

          {error && <div className="error-box">{error}</div>}

          <div className="action-buttons">
            <button
              className="btn btn-primary"
              onClick={checkClaim}
              disabled={checking || ocrLoading || !claimText.trim()}
            >
              {checking ? 'Checking Fact Verification Pool...' : 'Verify Claim'}
            </button>
            <button className="btn btn-secondary" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>

        {/* Output Column */}
        <div className="verdict-section">
          <h3>2. Fact Check Report</h3>
          
          {!result && !checking && (
            <div className="verdict-placeholder glass-card">
              <span>🔍</span>
              <p>Waiting for claim submission...</p>
            </div>
          )}

          {checking && (
            <div className="verdict-placeholder glass-card loading-animation">
              <div className="spinner"></div>
              <p>Scraping source evidence & running claim verification...</p>
            </div>
          )}

          {result && (
            <div className="verdict-report">
              <div className="verdict-header glass-card">
                <div className="verdict-heading-row">
                  <span className={getRulingBadgeClass(result.verdict.ruling)}>
                    {result.verdict.ruling}
                  </span>
                  <div className="confidence-level">
                    <span className="label">Confidence:</span>
                    <span className={`val ${result.verdict.confidence.toLowerCase()}`}>
                      {result.verdict.confidence}
                    </span>
                  </div>
                </div>
                
                <h4 className="verdict-summary">"{result.verdict.summary}"</h4>
              </div>

              <div className="verdict-details glass-card">
                <h5>Detailed Analysis</h5>
                <p className="analysis-text">{result.verdict.analysis}</p>
                <div className="timing-info">
                  Verified in {result.timing.total_ms}ms (inference: {result.timing.generation_ms}ms)
                </div>
              </div>

              <div className="evidence-section">
                <h5>Evidence & Reference Sources</h5>
                {result.sources.length === 0 ? (
                  <p className="no-sources">No supporting web documents found for this claim.</p>
                ) : (
                  <div className="sources-list">
                    {result.sources.map((s) => (
                      <SourceCard key={s.index} source={s} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
