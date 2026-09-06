$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) {
    $python = 'C:\Users\nsj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
}
Write-Host 'Starting Marine 5G Ops Demo...'
Write-Host 'Open http://127.0.0.1:8765/ in a browser.'
& $python (Join-Path $project 'src\server.py')
