param(
    [switch]$SkipInstall,
    [switch]$SkipDbPush
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Key
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#')) {
            continue
        }
        if ($trimmed -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)\s*$") {
            $value = $matches[1].Trim()
            if ($value.Length -ge 2) {
                if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
            }
            return $value
        }
    }

    return $null
}

function Set-EnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )

    $existing = @()
    if (Test-Path $Path) {
        $existing = Get-Content -Path $Path
    }

    $updated = $false
    $result = @()

    foreach ($line in $existing) {
        if (-not $updated -and $line -match "^\s*$([regex]::Escape($Key))\s*=") {
            $result += "$Key=$Value"
            $updated = $true
        } else {
            $result += $line
        }
    }

    if (-not $updated) {
        $result += "$Key=$Value"
    }

    Set-Content -Path $Path -Value $result -Encoding UTF8
}

function Test-PortInUse {
    param([int]$Port)

    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
        return $null -ne $connection
    } catch {
        return $false
    }
}

function Escape-SingleQuoted {
    param([string]$Value)
    return ($Value -replace "'", "''")
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$relayPath = Join-Path $projectRoot "mini-services\relay-backend"

if (-not (Test-Path $relayPath)) {
    Write-Host "❌ Relay backend не найден по пути: $relayPath" -ForegroundColor Red
    exit 1
}

$bunExists = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunExists) {
    Write-Host "❌ Bun не найден. Установите Bun: https://bun.sh/" -ForegroundColor Red
    exit 1
}

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "     PRESIDIUM Messenger Dev Launcher      " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📁 Project root: $projectRoot" -ForegroundColor Gray
Write-Host ""

if (Test-PortInUse -Port 3000) {
    Write-Host "⚠️ Порт 3000 уже занят (возможно Next.js уже запущен)." -ForegroundColor Yellow
}
if (Test-PortInUse -Port 3001) {
    Write-Host "⚠️ Порт 3001 уже занят (возможно Relay уже запущен)." -ForegroundColor Yellow
}

$nextAuthSecret = Get-EnvValue (Join-Path $projectRoot ".env.local") "NEXTAUTH_SECRET"
if ([string]::IsNullOrWhiteSpace($nextAuthSecret)) {
    $nextAuthSecret = Get-EnvValue (Join-Path $projectRoot ".env") "NEXTAUTH_SECRET"
}
if ([string]::IsNullOrWhiteSpace($nextAuthSecret)) {
    $nextAuthSecret = "dev-secret-key-change-in-production"
    Write-Host "⚠️ NEXTAUTH_SECRET не найден в .env.local/.env. Использую временный dev-ключ." -ForegroundColor Yellow
}

$relayEnvPath = Join-Path $relayPath ".env"
if (-not (Test-Path $relayEnvPath)) {
    New-Item -ItemType File -Path $relayEnvPath -Force | Out-Null
}

Set-EnvValue -Path $relayEnvPath -Key "PORT" -Value "3001"
Set-EnvValue -Path $relayEnvPath -Key "CORS_ORIGINS" -Value "http://localhost:3000,http://127.0.0.1:3000"
Set-EnvValue -Path $relayEnvPath -Key "JWT_SECRET" -Value $nextAuthSecret
Set-EnvValue -Path $relayEnvPath -Key "RELAY_DATABASE_URL" -Value "file:./presidium.db"
Set-EnvValue -Path $relayEnvPath -Key "RELAY_DEV_OTP_PREVIEW" -Value "true"

Write-Host "✅ mini-services/relay-backend/.env синхронизирован (JWT_SECRET = NEXTAUTH_SECRET)." -ForegroundColor Green

if (-not $SkipInstall) {
    if (-not (Test-Path (Join-Path $relayPath "node_modules"))) {
        Write-Host "📦 Устанавливаю зависимости relay..." -ForegroundColor Yellow
        Push-Location $relayPath
        try {
            bun install
        } finally {
            Pop-Location
        }
    }

    if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
        Write-Host "📦 Устанавливаю зависимости приложения..." -ForegroundColor Yellow
        Push-Location $projectRoot
        try {
            bun install
        } finally {
            Pop-Location
        }
    }
}

if (-not $SkipDbPush) {
    $relayDbPath = Join-Path $relayPath "presidium.db"
    if (-not (Test-Path $relayDbPath)) {
        Write-Host "🗄️ Инициализирую relay БД (bun run db:push)..." -ForegroundColor Yellow
        Push-Location $relayPath
        try {
            bun run db:push
        } finally {
            Pop-Location
        }
    }
}

$escapedRelayPath = Escape-SingleQuoted $relayPath
$escapedProjectRoot = Escape-SingleQuoted $projectRoot

$relayCommand = @"
Write-Host '═══════════════════════════════════════' -ForegroundColor Blue
Write-Host '     Relay Backend Server              ' -ForegroundColor Blue
Write-Host '═══════════════════════════════════════' -ForegroundColor Blue
Set-Location -LiteralPath '$escapedRelayPath'
bun run dev
"@

$nextCommand = @"
Write-Host '═══════════════════════════════════════' -ForegroundColor Magenta
Write-Host '     Next.js Application               ' -ForegroundColor Magenta
Write-Host '═══════════════════════════════════════' -ForegroundColor Magenta
Set-Location -LiteralPath '$escapedProjectRoot'
bun run dev
"@

Write-Host "🚀 Запускаю Relay Backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", $relayCommand -WindowStyle Normal | Out-Null
Start-Sleep -Seconds 2

Write-Host "🚀 Запускаю Next.js App..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", $nextCommand -WindowStyle Normal | Out-Null

Write-Host ""
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "✅ Оба сервера запущены" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "📱 App:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔌 Relay: http://localhost:3001" -ForegroundColor Cyan
Write-Host "💊 Health: http://localhost:3001/health" -ForegroundColor Cyan
