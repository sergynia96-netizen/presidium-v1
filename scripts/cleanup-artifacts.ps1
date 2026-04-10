[CmdletBinding()]
param(
  [switch]$PruneUploadArtifacts
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$zscriptsDir = Join-Path $projectRoot ".zscripts"
$uploadDir = Join-Path $projectRoot "upload"

$removed = New-Object System.Collections.Generic.List[string]

function Remove-MatchingFiles {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Patterns
  )

  if (-not (Test-Path $Path)) {
    return
  }

  foreach ($pattern in $Patterns) {
    Get-ChildItem -Path $Path -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      $script:removed.Add($_.FullName)
    }
  }
}

# 1) Always clean volatile runtime artifacts in .zscripts
Remove-MatchingFiles -Path $zscriptsDir -Patterns @("*.log", "*.err.log", "*.out.log", "eslint-report.json")

# Remove only stale PID files (do not break currently running sessions)
if (Test-Path $zscriptsDir) {
  Get-ChildItem -Path $zscriptsDir -Filter "*.pid" -File -ErrorAction SilentlyContinue | ForEach-Object {
    $raw = (Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue).Trim()
    $isRunning = $false

    if ($raw -match "^\d+$") {
      $pidValue = [int]$raw
      $isRunning = $null -ne (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)
    }

    if (-not $isRunning) {
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      $script:removed.Add($_.FullName)
    }
  }
}

# 2) Optional: prune archive extraction leftovers from upload/
if ($PruneUploadArtifacts -and (Test-Path $uploadDir)) {
  $dirPatterns = @("workspace-*", "messenger-extract")

  foreach ($pattern in $dirPatterns) {
    Get-ChildItem -Path $uploadDir -Directory -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      $script:removed.Add($_.FullName)
    }
  }
}

Write-Host "Cleanup completed. Removed items: $($removed.Count)"
if ($removed.Count -gt 0) {
  $removed | ForEach-Object { Write-Host " - $_" }
}

if ($PruneUploadArtifacts) {
  Write-Host "Upload artifact pruning: enabled"
} else {
  Write-Host "Upload artifact pruning: skipped (use -PruneUploadArtifacts to enable)"
}
