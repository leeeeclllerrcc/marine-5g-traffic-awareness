$ErrorActionPreference = 'Stop'

$repository = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $repository 'prototype\src\server.py'
$localUrl = 'http://127.0.0.1:8765/'
$onlineUrl = 'https://raw.githack.com/leeeeclllerrcc/marine-5g-traffic-awareness/main/'
$pidFile = Join-Path $env:TEMP 'marine5g_demo_8765.pid'
$stdoutLog = Join-Path $env:TEMP 'marine5g_demo_8765.out.log'
$stderrLog = Join-Path $env:TEMP 'marine5g_demo_8765.err.log'

function Test-MarineDemo {
    try {
        $health = Invoke-RestMethod -Uri ($localUrl + 'api/health') -TimeoutSec 1
        return [bool]$health.ok
    }
    catch {
        return $false
    }
}

try {
    if (Test-MarineDemo) {
        Start-Process $localUrl
        Write-Host 'Marine 5G demo is already running. The browser has been opened.'
        exit 0
    }

    $listener = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        throw 'Port 8765 is occupied by another program. Close that program, then run START_DEMO.cmd again.'
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    $pythonArgs = @()
    if (-not $pythonCommand) {
        $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
        if ($pythonCommand) {
            $pythonArgs += '-3'
        }
    }

    if (-not $pythonCommand) {
        Write-Host 'Python was not found. Opening the no-install online demo instead.'
        Start-Process $onlineUrl
        exit 0
    }

    $pythonArgs += ('"' + $serverScript + '"')
    $process = Start-Process -FilePath $pythonCommand.Source -ArgumentList $pythonArgs -WorkingDirectory (Join-Path $repository 'prototype') -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
    Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII

    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
        Start-Sleep -Milliseconds 250
        if (Test-MarineDemo) {
            Start-Process $localUrl
            Write-Host 'Marine 5G demo started successfully. The browser has been opened.'
            exit 0
        }
        if ($process.HasExited) {
            break
        }
    }

    $details = ''
    if (Test-Path -LiteralPath $stderrLog) {
        $details = (Get-Content -Raw -LiteralPath $stderrLog -ErrorAction SilentlyContinue)
    }
    throw ('The local demo could not start. ' + $details)
}
catch {
    Write-Host ''
    Write-Host ('Startup failed: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('You can still use the online demo: ' + $onlineUrl) -ForegroundColor Yellow
    exit 1
}
