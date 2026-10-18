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

function Write-BackupLog([string]$Message) {
  Write-Host $Message
  Add-Content -LiteralPath $logFile -Value $Message
}

Push-Location $backendRoot
try {
  Write-BackupLog "[local-backup] Starting Railway production backup into $BackupDir"
  $pgDumpTool = if ($env:PG_DUMP_PATH) { $env:PG_DUMP_PATH } else { "pg_dump" }
  $pgDumpAvailable = [bool](Get-Command $pgDumpTool -ErrorAction SilentlyContinue)
  $dockerCli = Get-Command docker -ErrorAction SilentlyContinue
  Write-BackupLog "[local-backup] Local tools: pg_dump=$pgDumpAvailable; docker=$([bool]$dockerCli)"
  if (-not $pgDumpAvailable) {
    if (-not $dockerCli) { throw "Neither pg_dump nor Docker CLI is installed" }
    $dockerReady = $false
    try {
      & $dockerCli.Source version --format '{{.Server.Version}}' *> $null
      $dockerReady = $LASTEXITCODE -eq 0
    } catch { }
    if (-not $dockerReady) {
      $desktopPath = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
      if (-not (Test-Path -LiteralPath $desktopPath)) { throw "Docker Desktop is unavailable; install PostgreSQL client tools or Docker Desktop" }
      Write-BackupLog "[local-backup] Starting Docker Desktop and waiting for its engine"
      Start-Process -FilePath $desktopPath -WindowStyle Hidden
      for ($attempt = 0; $attempt -lt 60 -and -not $dockerReady; $attempt++) {
        Start-Sleep -Seconds 2
        try {
          & $dockerCli.Source version --format '{{.Server.Version}}' *> $null
          $dockerReady = $LASTEXITCODE -eq 0
        } catch { }
      }
    }
    if (-not $dockerReady) { throw "Docker Desktop did not become ready within two minutes" }
    Write-BackupLog "[local-backup] Docker engine ready"
  }
  & railway run --service DukaPilot --environment production --no-local -- node scripts/backup.js 2>&1 | Tee-Object -FilePath $logFile -Append
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "Backup command exited with code $exitCode. See $logFile" }
  Write-BackupLog "[local-backup] Completed. Log: $logFile"
} catch {
  Write-BackupLog "[local-backup] FAILED: $($_.Exception.Message)"
  throw
} finally {
  Pop-Location
}
