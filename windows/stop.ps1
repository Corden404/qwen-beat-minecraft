param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.runtime/active.json')) { Write-Host 'No recorded supervisor'; return }
$taskState = Get-Content -LiteralPath .runtime/active.json -Raw | ConvertFrom-Json
$taskProcess = Get-Process -Id $taskState.pid -ErrorAction SilentlyContinue
if (-not $taskProcess -or $taskProcess.Path -ne $taskState.exe -or [string]$taskProcess.StartTime.ToUniversalTime().Ticks -ne [string]$taskState.startTicks) { Write-Host 'Supervisor already stopped'; return }
$taskControl = Join-Path '.runtime/runs' $taskState.run
New-Item -ItemType Directory -Force -Path $taskControl | Out-Null
'User requested stop' | Set-Content -LiteralPath (Join-Path $taskControl 'stop')
Write-Host 'Stopping at an action boundary; waiting for recording finalization and world save.'
if (-not $taskProcess.WaitForExit(240000)) { throw 'Graceful stop timed out. Inspect project logs; cleanup is refused while project processes are running.' }
Write-Host 'Project processes stopped. The shared Qwen service is unchanged.'
