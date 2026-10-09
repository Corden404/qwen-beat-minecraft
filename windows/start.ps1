param([string]$RunId = ('qwen-' + (Get-Date -Format 'yyyyMMdd-HHmmss')), [int]$MaxMinutes = 60)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if ($RunId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$') { throw 'Invalid run name' }
if (-not (Test-Path -LiteralPath '.runtime/config.json')) { throw 'Run windows/setup.ps1 first' }
if (Test-Path -LiteralPath '.runtime/active.json') {
    $taskPrevious = Get-Content -LiteralPath .runtime/active.json -Raw | ConvertFrom-Json
    $taskOwner = Get-Process -Id $taskPrevious.pid -ErrorAction SilentlyContinue
    if ($taskOwner -and $taskOwner.Path -eq $taskPrevious.exe -and [string]$taskOwner.StartTime.ToUniversalTime().Ticks -eq [string]$taskPrevious.startTicks) { throw 'A project run is already active; stop it before starting another.' }
}
if (-not (Test-Path -LiteralPath 'server/eula.txt') -or (Get-Content -LiteralPath server/eula.txt -Raw) -notmatch '(?m)^eula=true\s*$') { throw 'Review https://aka.ms/MinecraftEULA and set eula=true in server/eula.txt before starting.' }
New-Item -ItemType Directory -Force -Path .runtime/temp,.runtime/logs | Out-Null
$env:TEMP = Join-Path $PWD '.runtime/temp'
$env:TMP = $env:TEMP
$env:MAX_RUN_MINUTES = [string]$MaxMinutes
$taskNode = (Get-Command node.exe).Source
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @(('"' + (Join-Path $PWD 'windows/run.mjs') + '"'),$RunId) -WorkingDirectory $PWD -WindowStyle Hidden -RedirectStandardOutput ".runtime/logs/$RunId.stdout.log" -RedirectStandardError ".runtime/logs/$RunId.stderr.log" -PassThru
@{run=$RunId;pid=$taskProcess.Id;startTicks=[string]$taskProcess.StartTime.ToUniversalTime().Ticks;exe=$taskNode} | ConvertTo-Json | Set-Content -LiteralPath .runtime/active.json -Encoding utf8
Write-Host "Started $RunId. Status: http://127.0.0.1:3078. Stop with windows/stop.ps1."
