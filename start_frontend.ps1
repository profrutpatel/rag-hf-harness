# Start Frontend
Write-Host "Starting Vite dev server..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "Frontend starting on http://localhost:5173" -ForegroundColor Green
npm run dev
