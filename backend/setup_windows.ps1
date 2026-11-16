$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "CartWise backend setup" -ForegroundColor Cyan

if (-not (Test-Path ".venv")) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        py -3.12 -m venv .venv
    } else {
        python -m venv .venv
    }
}

$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Virtual environment creation failed. Install Python 3.11 or 3.12 and retry." }

& $python -m pip install --upgrade pip
& $python -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created backend\.env from .env.example. Add your RapidAPI key before live search." -ForegroundColor Yellow
}

Write-Host "Setup complete. Start the backend with:" -ForegroundColor Green
Write-Host ".\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
