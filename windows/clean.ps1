[CmdletBinding(SupportsShouldProcess=$true)]
param([switch]$IncludeRuns)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
Set-Location $taskRoot
if (-not $WhatIfPreference) { & (Join-Path $PSScriptRoot 'stop.ps1') }
$taskProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($taskRoot) -and $_.Name -match '^(java|javaw|node|ffmpeg.*)\.exe$' }
if ($taskProcesses) { throw 'Project processes are still running; inspect them before cleanup.' }
$taskTargets = @('node_modules','.runtime','server','observer/javassist.jar','observer/dragon-observer.jar','native-client/libraries','native-client/natives','native-client/assets','native-client/game','native-client/classes','native-client/client.jar','native-client/native-view-agent.jar','native-client/config.json','native-client/classpath.txt','native-client/resources-ready.txt','native-client/capture-heartbeat.json','native-client/record-path.txt','native-client/native-preview.png','native-client/ui-command.txt','native-client/ui-ack.txt')
$taskTargets += @(Get-ChildItem -LiteralPath observer -Filter '*.class' -File | ForEach-Object { 'observer/' + $_.Name })
if ($IncludeRuns) { $taskTargets += 'runs' }
$taskDestination = Join-Path $taskRoot ('.trash/cleanup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
foreach ($taskRelative in $taskTargets) {
    $taskSource = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskRelative))
    if (-not $taskSource.StartsWith($taskRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup target escaped project root' }
    if (Test-Path -LiteralPath $taskSource) {
        $taskItem = Get-Item -LiteralPath $taskSource -Force
        if ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cleanup refuses junctions and symbolic links' }
        $taskTrashPath = Join-Path $taskDestination $taskRelative
        if ($PSCmdlet.ShouldProcess($taskSource,"Move to $taskTrashPath")) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $taskTrashPath) | Out-Null
            Move-Item -LiteralPath $taskSource -Destination $taskTrashPath
        }
    }
}
if ($WhatIfPreference) { Write-Host 'Preview only; no files were moved.'; return }
Write-Host "Moved generated dependencies and worlds to $taskDestination"
Write-Host 'Source and shared Node/Java/Qwen are retained. Runs are retained unless -IncludeRuns is used. Space is reclaimed only after you choose to empty .trash.'
