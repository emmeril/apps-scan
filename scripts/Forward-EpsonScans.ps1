param(
    [Parameter(Mandatory=$true)][string]$DocumentsFolder,
    [Parameter(Mandatory=$true)][string]$InboxFolder,
    [string]$LogFile,
    [int]$MinimumAgeSeconds = 20
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $DocumentsFolder -PathType Container)) { throw 'Folder Documents tidak ditemukan.' }
[void][IO.Directory]::CreateDirectory($InboxFolder)

function Write-ForwardLog([string]$Message) {
    if ($LogFile) {
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($LogFile)))
        Add-Content -LiteralPath $LogFile -Value ('{0:o} {1}' -f (Get-Date), $Message) -Encoding UTF8
    }
}

$failed = $false
foreach ($file in Get-ChildItem -LiteralPath $DocumentsFolder -File -Filter 'Image_*.pdf') {
    if ($file.Name -notmatch '^Image_\d{8}_\d{4,}\.pdf$') { continue }
    if ($file.LastWriteTimeUtc -gt [DateTime]::UtcNow.AddSeconds(-$MinimumAgeSeconds)) { continue }
    $source = $null
    $partial = $null
    try {
        # A writer cannot reopen the source until the copy finishes.
        $source = [IO.File]::Open($file.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        if ($source.Length -lt 5) { continue }
        $header = New-Object byte[] 5
        [void]$source.Read($header, 0, 5)
        if ([Text.Encoding]::ASCII.GetString($header) -ne '%PDF-') { continue }
        $source.Position = 0
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($source)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
        $destination = Join-Path $InboxFolder $file.Name
        if (Test-Path -LiteralPath $destination) {
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $hash) { continue }
            $destination = Join-Path $InboxFolder ($file.BaseName + '-' + $hash + '.pdf')
            if (Test-Path -LiteralPath $destination) {
                if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $hash) { continue }
                throw 'File tujuan berbeda walaupun memiliki nama hash yang sama.'
            }
        }
        $partial = Join-Path $InboxFolder ([Guid]::NewGuid().ToString('N') + '.partial')
        $source.Position = 0
        $output = [IO.File]::Open($partial, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $source.CopyTo($output); $output.Flush($true) }
        finally { $output.Dispose() }
        [IO.File]::Move($partial, $destination)
        $partial = $null
        Write-ForwardLog ('Copied ' + $file.Name + ' -> ' + [IO.Path]::GetFileName($destination))
    } catch {
        $failed = $true
        Write-ForwardLog ('Failed ' + $file.Name + ': ' + $_.Exception.Message)
        Write-Warning ($file.Name + ': ' + $_.Exception.Message)
    } finally {
        if ($source) { $source.Dispose() }
        if ($partial -and (Test-Path -LiteralPath $partial)) { [IO.File]::Delete($partial) }
    }
}
if ($failed) { exit 1 }
