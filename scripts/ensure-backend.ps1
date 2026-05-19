# Bring the SudokuBackend stack up for local E2E development.
#
# Assumes ../SudokuBackend has been cloned alongside this repo. Sets
# the CORS origin to match this frontend (port 5173) before starting
# docker compose.

[CmdletBinding()]
param(
    [string]$BackendPath = (Join-Path $PSScriptRoot '..\..\SudokuBackend' -Resolve -ErrorAction SilentlyContinue)
)

if (-not $BackendPath -or -not (Test-Path $BackendPath)) {
    throw "Could not find SudokuBackend at '$BackendPath'. Pass -BackendPath explicitly."
}

Push-Location $BackendPath
try {
    $env:Cors__AllowedOrigins__0 = 'http://localhost:5173'
    $env:Cors__AllowedOrigins__1 = 'http://localhost:4173'

    Write-Host "Starting backend in $BackendPath"
    docker compose up -d --build

    Write-Host "Waiting for /health/ready..."
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-RestMethod -Uri 'http://localhost:8080/health/ready' -TimeoutSec 2 | Out-Null
            Write-Host "Backend is ready."
            exit 0
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    throw "Backend did not become ready within 120 seconds."
} finally {
    Pop-Location
}
