[CmdletBinding()]
param(
  [int]$NextPort = 3000,
  [int]$RelayPort = 3001
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$zscriptsDir = Join-Path $projectRoot ".zscripts"
$devPidFile = Join-Path $zscriptsDir "dev.pid"
$relayPidFile = Join-Path $zscriptsDir "relay.pid"

function Get-CommandLineByProcessId {
  param([int]$ProcessId)
  try {
    return (Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId").CommandLine
  } catch {
    return $null
  }
}

function Stop-ByPidFile {
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
      Write-Host "Stopped $Label PID $targetPid"
    } catch {
      Write-Host "$Label PID $targetPid is already stopped"
    }
  }

  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ListenersByPort {
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
      Write-Host "Stopped project listener PID $targetPid on port $($listener.LocalPort)"
    }
  }
}

Stop-ByPidFile -PidFile $devPidFile -Label "Next.js"
Stop-ByPidFile -PidFile $relayPidFile -Label "Relay"
Stop-ListenersByPort -Ports @($NextPort, $RelayPort)

Write-Host "LAN dev processes are stopped."
