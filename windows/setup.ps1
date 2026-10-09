param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
foreach ($taskFolder in @('.runtime/temp','.runtime/npm-cache','.runtime/node-gyp','.runtime/pip-cache','.runtime/python')) { New-Item -ItemType Directory -Force -Path $taskFolder | Out-Null }
$env:TEMP = Join-Path $PWD '.runtime/temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $PWD '.runtime/npm-cache'
$env:npm_config_devdir = Join-Path $PWD '.runtime/node-gyp'
$env:PYTHONDONTWRITEBYTECODE = '1'
if (-not $env:MC_JAVA_HOME) { $env:MC_JAVA_HOME = Split-Path -Parent (Split-Path -Parent (Get-Command javac.exe -ErrorAction Stop).Source) }
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm installation failed' }
python -m pip --isolated install --target .runtime/python --cache-dir .runtime/pip-cache --no-deps --index-url https://pypi.tuna.tsinghua.edu.cn/simple imageio-ffmpeg==0.6.0
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg installation failed' }
python -B windows/install.py
if ($LASTEXITCODE -ne 0) { throw 'Native client installation failed' }
Write-Host 'Ready. Run windows/start.ps1 to start a recorded Qwen run.'
