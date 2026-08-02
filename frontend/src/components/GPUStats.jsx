import React from 'react'

/**
 * GPUStats — live engine health bar in the header area.
 * Polls /api/health every 5 seconds.
 */
export default function GPUStats({ status }) {
  if (!status) return null

  const gpu = status.gpu || {}
  const vramTotal = gpu.vram_total_mb || 0
  const vramUsed  = gpu.vram_used_mb || 0
  const vramPct   = vramTotal > 0 ? (vramUsed / vramTotal) * 100 : 0

  const barClass = vramPct > 90 ? 'crit' : vramPct > 70 ? 'warn' : ''

  return (
    <div className="gpu-stats-bar">
      {/* GPU name */}
      {gpu.device && (
        <div className="gpu-stat">
          <span>🖥</span>
          <span className="gpu-stat-value" style={{ color: 'var(--accent-3)' }}>
            {gpu.device.replace('NVIDIA ', '')}
          </span>
        </div>
      )}

      {/* Replicas */}
      <div className="gpu-stat">
        <span className="gpu-stat-label">Replicas</span>
        <span className="gpu-stat-value">
          {status.pool_available}/{status.replica_count}
        </span>
      </div>

      {/* VRAM bar */}
      {vramTotal > 0 && (
        <div className="gpu-stat" style={{ flex: 1, minWidth: 160 }}>
          <span className="gpu-stat-label">VRAM</span>
          <div className="vram-bar-wrap" style={{ flex: 1, maxWidth: 160 }}>
            <div className="vram-bar-bg">
              <div
                className={`vram-bar-fill ${barClass}`}
                style={{ width: `${vramPct.toFixed(1)}%` }}
              />
            </div>
          </div>
          <span className="gpu-stat-value">
            {vramUsed.toFixed(0)}/{vramTotal.toFixed(0)} MB
          </span>
        </div>
      )}

      {/* Avg latency */}
      {status.total_requests > 0 && (
        <div className="gpu-stat">
          <span className="gpu-stat-label">Avg Latency</span>
          <span className="gpu-stat-value">
            {(status.avg_latency_ms / 1000).toFixed(1)}s
          </span>
        </div>
      )}

      {/* Total requests */}
      <div className="gpu-stat">
        <span className="gpu-stat-label">Requests</span>
        <span className="gpu-stat-value">{status.total_requests}</span>
      </div>
    </div>
  )
}
