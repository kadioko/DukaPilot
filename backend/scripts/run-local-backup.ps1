[CmdletBinding()]
param(
  [string]$BackupDir = $(if ($env:DUKAPILOT_BACKUP_DIR) { $env:DUKAPILOT_BACKUP_DIR } else { Join-Path $HOME "DukaPilot-Backups" }),
  [ValidateRange(1, 3650)]
  [int]$RetainDays = $(if ($env:DUKAPILOT_BACKUP_RETAIN_DAYS) { [int]$env:DUKAPILOT_BACKUP_RETAIN_DAYS } else { 14 })
)

$ErrorActionPreference = "Stop"
$backendRoot = Split-Path -Parent $PSScriptRoot
$BackupDir = [System.IO.Path]::GetFullPath($BackupDir)
$logDir = Join-Path $BackupDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd"
$logFile = Join-Path $logDir "backup-$timestamp.log"
$env:LOCAL_BACKUP_DIR = $BackupDir
$env:BACKUP_RETAIN_DAYS = "$RetainDays"

Push-Location $backendRoot
try {
  Write-Host "[local-backup] Starting Railway production backup into $BackupDir"
  & railway run --service DukaPilot --environment production --no-local -- node scripts/backup.js 2>&1 | Tee-Object -FilePath $logFile -Append
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "Backup command exited with code $exitCode. See $logFile" }
  Write-Host "[local-backup] Completed. Log: $logFile"
} finally {
  Pop-Location
}
