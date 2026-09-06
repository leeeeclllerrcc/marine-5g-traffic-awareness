param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$manifest = Join-Path $Root 'release\SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $manifest)) {
    throw "Integrity manifest not found: $manifest"
}

$failed = $false
Get-Content -LiteralPath $manifest -Encoding UTF8 | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_)) { return }
    $parts = $_ -split '  ', 2
    if ($parts.Count -ne 2) { $failed = $true; Write-Host "INVALID $($_)"; return }
    $expected = $parts[0].Trim()
    $relative = $parts[1].Trim()
    $target = Join-Path $Root $relative
    if (-not (Test-Path -LiteralPath $target)) {
        $failed = $true; Write-Host "MISSING $relative"; return
    }
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected.ToLowerInvariant()) {
        $failed = $true; Write-Host "CHANGED $relative"
    } else {
        Write-Host "OK $relative"
    }
}

if ($failed) { exit 1 }
Write-Host 'Integrity check passed.'
