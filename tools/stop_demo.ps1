$ErrorActionPreference = 'Stop'

$pidFile = Join-Path $env:TEMP 'marine5g_demo_8765.pid'

try {
    if (-not (Test-Path -LiteralPath $pidFile)) {
        Write-Host 'No locally started Marine 5G demo process was found.'
        exit 0
    }

    $processId = [int](Get-Content -Raw -LiteralPath $pidFile)
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($processInfo -and $processInfo.CommandLine -match 'prototype[\\/]src[\\/]server\.py') {
        Stop-Process -Id $processId -Force
        Write-Host 'Marine 5G demo stopped.'
    }
    else {
        Write-Host 'The saved process is no longer the Marine 5G demo; no process was stopped.'
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    exit 0
}
catch {
    Write-Host ('Stop failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
