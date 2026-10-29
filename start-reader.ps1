param([int]$Port = 8766, [string]$Python = '')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $Python) { $Python = $env:TERRA_PYTHON }
$runtimeConfig = Join-Path $root 'config/runtime.local.json'
if (-not $Python -and (Test-Path -LiteralPath $runtimeConfig)) {
    $Python = (Get-Content -LiteralPath $runtimeConfig -Raw | ConvertFrom-Json).python
}
if (-not $Python) { $Python = 'python' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'reader/data/catalog.json')) -and -not (Test-Path -LiteralPath (Join-Path $root 'data/active-reader.json'))) {
    & $Python (Join-Path $root 'scripts/bootstrap.py')
    if ($LASTEXITCODE -ne 0) { throw 'Data initialization failed. Install Python 3.10+ and check the network.' }
}
& $Python (Join-Path $root 'scripts/serve.py') --port $Port
exit $LASTEXITCODE
