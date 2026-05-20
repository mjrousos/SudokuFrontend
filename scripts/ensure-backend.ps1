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
    # The SudokuBackend docker-compose.yml has no `env_file:` and only an
    # explicit `environment:` block, so plain shell env vars are NOT
    # forwarded into the container. Write a dedicated `docker-compose.e2e.yml`
    # and pass it explicitly with `-f` instead of relying on the auto-merged
    # `docker-compose.override.yml` — that way we don't clobber a developer's
    # local override file:
    #
    # * Cors__AllowedOrigins lets the browser at http://localhost:5173
    #   (vite preview) call the api at http://localhost:8080.
    #
    # * ASPNETCORE_ENVIRONMENT=Testing flips the explicit escape hatches in
    #   Program.cs that skip the per-remote-IP rate limiter (which under
    #   docker's bridge network would bucket every test to the same gateway
    #   IP) and the HTTPS redirect.
    $override = @'
services:
  api:
    environment:
      ASPNETCORE_ENVIRONMENT: Testing
      Cors__AllowedOrigins__0: http://localhost:5173
      Cors__AllowedOrigins__1: http://localhost:4173
'@
    Set-Content -Path (Join-Path $BackendPath 'docker-compose.e2e.yml') -Value $override -Encoding UTF8

    Write-Host "Starting backend in $BackendPath"
    docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build

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
