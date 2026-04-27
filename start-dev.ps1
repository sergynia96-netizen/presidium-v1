# Backward-compatible wrapper.
# Canonical script lives in scripts/start-dev.ps1.

$scriptPath = Join-Path $PSScriptRoot "scripts\start-dev.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Не найден скрипт запуска: $scriptPath" -ForegroundColor Red
    exit 1
}

& $scriptPath @args
