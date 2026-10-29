param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
# Compatibility wrapper: download the pinned package without building it.
& $Python (Join-Path $PSScriptRoot 'bootstrap.py') --download-only
exit $LASTEXITCODE
