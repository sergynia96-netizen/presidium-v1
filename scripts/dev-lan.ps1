[CmdletBinding()]
param(
  [int]$NextPort = 3000,
  [int]$RelayPort = 3001
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$zscriptsDir = Join-Path $projectRoot ".zscripts"
New-Item -ItemType Directory -Path $zscriptsDir -Force | Out-Null

$devPidFile = Join-Path $zscriptsDir "dev.pid"
$relayPidFile = Join-Path $zscriptsDir "relay.pid"
$nextLog = Join-Path $zscriptsDir "next-lan.log"
$nextErr = Join-Path $zscriptsDir "next-lan.err.log"
$relayLog = Join-Path $zscriptsDir "relay-lan.log"
$relayErr = Join-Path $zscriptsDir "relay-lan.err.log"

function Resolve-PreferredNodeExe {
  param([string]$ProjectRoot)

  $portableNodes = Get-ChildItem -Path (Join-Path $ProjectRoot "tools") -Directory -Filter "node-v22.*-win-x64" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending

  foreach ($dir in $portableNodes) {
    $candidate = Join-Path $dir.FullName "node.exe"
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return "node"
}

function Get-CommandLineByProcessId {
  param([int]$ProcessId)
  try {
    return (Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId").CommandLine
  } catch {
    return $null
  }
}

function Stop-FromPidFile {
  param(
    [string]$PidFile,
    [string]$Label
  )

  if (-not (Test-Path $PidFile)) {
    return
  }

  $raw = (Get-Content $PidFile -Raw).Trim()
  if ($raw -match "^\d+$") {
    $targetPid = [int]$raw
    try {
      Stop-Process -Id $targetPid -Force -ErrorAction Stop
      Write-Host "Stopped $Label process PID $targetPid"
    } catch {
      Write-Host "$Label PID $targetPid is not running"
    }
  }

  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-PresidiumListeners {
  param([int[]]$Ports)

  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $Ports -contains $_.LocalPort } |
    Select-Object -Property OwningProcess, LocalPort -Unique

  foreach ($listener in $listeners) {
    $targetPid = [int]$listener.OwningProcess
    $cmd = Get-CommandLineByProcessId -ProcessId $targetPid
    $procName = (Get-Process -Id $targetPid -ErrorAction SilentlyContinue).ProcessName
    $looksLikeRelay = $listener.LocalPort -eq $RelayPort -and $procName -eq 'bun' -and $cmd -like '*--hot src/index.ts*'
    $looksLikeNext = $listener.LocalPort -eq $NextPort -and $procName -eq 'node' -and $cmd -like '*next*start-server.js*'
    if (($cmd -and $cmd -like "*$projectRoot*") -or $looksLikeRelay -or $looksLikeNext) {
      Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped leftover listener PID $targetPid on port $($listener.LocalPort)"
    }
  }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [string]$Label,
    [int]$TimeoutSec = 60
  )

  for ($i = 0; $i -lt $TimeoutSec; $i++) {
    Start-Sleep -Seconds 1
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        Write-Host "$Label is reachable at $Url"
        return $true
      }
    } catch {
      continue
    }
  }

  return $false
}

function Get-LanIps {
  $privateIpv4Pattern = "^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)"
  return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -ne "127.0.0.1" -and
      $_.IPAddress -match $privateIpv4Pattern
    } |
    Select-Object -ExpandProperty IPAddress -Unique
}

$startedPids = @()

try {
  Write-Host "Preparing clean startup for LAN mode..."
  Stop-FromPidFile -PidFile $devPidFile -Label "Next.js"
  Stop-FromPidFile -PidFile $relayPidFile -Label "Relay"
  Stop-PresidiumListeners -Ports @($NextPort, $RelayPort)

  Remove-Item $nextLog, $nextErr, $relayLog, $relayErr -ErrorAction SilentlyContinue

  $nodeExe = Resolve-PreferredNodeExe -ProjectRoot $projectRoot
  $nodeVersion = (& $nodeExe -v).Trim()
  if ($nodeVersion -match "^v(\d+)\.") {
    $nodeMajor = [int]$Matches[1]
    if ($nodeMajor -ge 25 -and $nodeExe -eq 'node') {
      Write-Warning "Global Node $nodeVersion detected. For best stability use Node 22 LTS."
    } elseif ($nodeMajor -eq 22) {
      Write-Host "Using Node LTS runtime: $nodeVersion ($nodeExe)"
    }
  }

  $lanIps = @(Get-LanIps)
  $relayOrigins = @("http://localhost:$NextPort", "http://127.0.0.1:$NextPort")
  foreach ($ip in $lanIps) {
    $relayOrigins += "http://${ip}:$NextPort"
  }

  if ($env:CORS_ORIGINS) {
    $relayOrigins += $env:CORS_ORIGINS.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  }

  $env:CORS_ORIGINS = ($relayOrigins | Select-Object -Unique) -join ","
  $env:PORT = "$RelayPort"

  $relayDir = Join-Path $projectRoot "mini-services/relay-backend"
  $relayProc = Start-Process -FilePath "bun" -ArgumentList "--hot", "src/index.ts" `
    -WorkingDirectory $relayDir `
    -RedirectStandardOutput $relayLog `
    -RedirectStandardError $relayErr `
    -PassThru
  $startedPids += $relayProc.Id
  Set-Content -Path $relayPidFile -Value $relayProc.Id
  Write-Host "Relay started with PID $($relayProc.Id)"

  if (-not (Wait-ForHttp -Url "http://127.0.0.1:$RelayPort/health" -Label "Relay backend" -TimeoutSec 45)) {
    throw "Relay backend did not become healthy in time."
  }

  $nextCli = Join-Path $projectRoot "node_modules/next/dist/bin/next"
  $nextProc = Start-Process -FilePath $nodeExe -ArgumentList $nextCli, "dev", "--hostname", "0.0.0.0", "--port", "$NextPort", "--webpack" `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $nextLog `
    -RedirectStandardError $nextErr `
    -PassThru
  $startedPids += $nextProc.Id
  Set-Content -Path $devPidFile -Value $nextProc.Id
  Write-Host "Next.js started with PID $($nextProc.Id)"

  if (-not (Wait-ForHttp -Url "http://127.0.0.1:$NextPort" -Label "Next.js frontend" -TimeoutSec 70)) {
    throw "Next.js frontend did not become ready in time."
  }

  Write-Host ""
  Write-Host "Services are running."
  Write-Host "Frontend local: http://localhost:$NextPort"
  foreach ($ip in $lanIps) {
    Write-Host "Frontend LAN:   http://${ip}:$NextPort"
  }
  Write-Host "Relay local:    http://localhost:$RelayPort/health"
  foreach ($ip in $lanIps) {
    Write-Host "Relay LAN:      http://${ip}:$RelayPort/health"
  }
  Write-Host ""
  Write-Host "Logs:"
  Write-Host "  $nextLog"
  Write-Host "  $relayLog"
  Write-Host ""
  Write-Host "Stop command: npm run dev:lan:stop"
} catch {
  Write-Error $_
  foreach ($startedPid in $startedPids) {
    Stop-Process -Id $startedPid -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $devPidFile, $relayPidFile -ErrorAction SilentlyContinue
  exit 1
}
