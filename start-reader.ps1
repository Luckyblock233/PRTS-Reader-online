$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (!(Test-Path "node_modules")) { npm ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
if (!(Test-Path "reader/data/catalog.json")) { npm run data:bootstrap; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
npm run dev
