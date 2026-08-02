# Start Backend (GPU engine loads at boot)
Write-Host "Starting Flask backend with GPU ModelEngine..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend"

# Create venv if needed
if (-not (Test-Path ".venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv .venv
}

# Activate
& ".venv\Scripts\Activate.ps1"

# Install deps
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt

Write-Host ""
Write-Host "Backend starting on http://localhost:5000" -ForegroundColor Green
Write-Host "(GPU model loading takes 30-90s on first run)" -ForegroundColor Yellow
Write-Host ""
python app.py
