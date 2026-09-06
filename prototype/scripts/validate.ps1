$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) {
    $python = 'C:\Users\nsj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
}
Push-Location $project
try {
    & $python -m py_compile .\src\generate_data.py .\src\analyze.py .\src\server.py
    & $python .\scripts\generate_report.py
    Write-Host 'Core validation completed.'
} finally {
    Pop-Location
}
