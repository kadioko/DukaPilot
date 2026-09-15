[CmdletBinding()]
param(
  [string]$BackupDir = $(if ($env:DUKAPILOT_BACKUP_DIR) { $env:DUKAPILOT_BACKUP_DIR } else { Join-Path $HOME "DukaPilot-Backups" }),
  [ValidateRange(1, 3650)]
  [int]$RetainDays = $(if ($env:DUKAPILOT_BACKUP_RETAIN_DAYS) { [int]$env:DUKAPILOT_BACKUP_RETAIN_DAYS } else { 14 }),
  [ValidatePattern("^([01]\\d|2[0-3]):[0-5]\\d$")]
  [string]$At = "02:20"
)

$ErrorActionPreference = "Stop"
$runner = Join-Path $PSScriptRoot "run-local-backup.ps1"
if (!(Test-Path -LiteralPath $runner)) { throw "Backup runner not found: $runner" }

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -BackupDir `"$BackupDir`" -RetainDays $RetainDays"
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($At, "HH:mm", [System.Globalization.CultureInfo]::InvariantCulture))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName "DukaPilot Local Database Backup" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Creates a verified local DukaPilot PostgreSQL archive from Railway production." -Force | Out-Null
Get-ScheduledTask -TaskName "DukaPilot Local Database Backup" | Select-Object TaskName, State, TaskPath
Write-Host "[local-backup] Scheduled daily at $At while $env:USERNAME is signed in."
