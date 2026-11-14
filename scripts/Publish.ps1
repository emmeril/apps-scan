#requires -Version 5.1
[CmdletBinding()]
param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot ('artifacts\publish-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$outputFull = [IO.Path]::GetFullPath($OutputPath)
if ((Test-Path -LiteralPath $outputFull) -and @(Get-ChildItem -LiteralPath $outputFull -Force).Count -gt 0) {
    throw 'Folder tujuan harus baru atau kosong. Gunakan folder baru agar file lama atau konfigurasi server tidak ikut dalam paket.'
}
Push-Location $projectRoot
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci gagal.' }
    & npm.cmd run assets
    if ($LASTEXITCODE -ne 0) { throw 'Penyiapan aset gagal.' }
    & dotnet publish '.\ScanInbox.csproj' -c Release -r win-x64 --self-contained false -o $outputFull
    if ($LASTEXITCODE -ne 0) { throw 'dotnet publish gagal.' }
    if (-not (Test-Path -LiteralPath (Join-Path $outputFull 'web.config'))) { throw 'web.config hasil publish tidak ditemukan.' }
    $zipPath = $outputFull.TrimEnd('\') + '.zip'
    Compress-Archive -Path (Join-Path $outputFull '*') -DestinationPath $zipPath -Force
    Write-Output "Folder IIS: $outputFull"
    Write-Output "Paket IIS: $zipPath"
} finally { Pop-Location }
