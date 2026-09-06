$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
& (Join-Path $repository 'tools\start_demo.ps1')
