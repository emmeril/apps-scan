param(
    [Parameter(Mandatory=$true)][string]$DocumentsFolder,
    [Parameter(Mandatory=$true)][string]$InboxFolder,
    [string]$LogFile,
    [ValidateRange(1,3600)][int]$MinimumAgeSeconds = 2,
    [switch]$Watch,
    [ValidateRange(1,60)][int]$PollSeconds = 1
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

$observed = @{}
$completed = @{}
$failures = @{}

function Invoke-ForwardPass {
    $failed = $false
    $seen = @{}
    foreach ($file in Get-ChildItem -LiteralPath $DocumentsFolder -File -Filter 'Image_*.pdf') {
        if ($file.Name -notmatch '^Image_\d{8}_\d{4,}\.pdf$') { continue }
        if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
        $key = $file.FullName
        $seen[$key] = $true
        $signature = '{0}:{1}' -f $file.Length, $file.LastWriteTimeUtc.Ticks
        if ($Watch -and $completed[$key] -eq $signature) { continue }
        $stable = $observed[$key] -eq $signature
        $observed[$key] = $signature
        if ($Watch -and -not $stable) { continue }
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
            $tailLength = [int][Math]::Min(2048, $source.Length)
            $tail = New-Object byte[] $tailLength
            $source.Position = $source.Length - $tailLength
            $tailRead = $source.Read($tail, 0, $tail.Length)
            if ([Text.Encoding]::ASCII.GetString($tail, 0, $tailRead) -notmatch '%%EOF') { continue }
            $source.Position = 0
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $hash = [BitConverter]::ToString($sha.ComputeHash($source)).Replace('-', '').ToLowerInvariant() }
            finally { $sha.Dispose() }
            $destination = Join-Path $InboxFolder $file.Name
            if (Test-Path -LiteralPath $destination) {
                if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $hash) { $completed[$key] = $signature; continue }
                $destination = Join-Path $InboxFolder ($file.BaseName + '-' + $hash + '.pdf')
                if (Test-Path -LiteralPath $destination) {
                    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $hash) { $completed[$key] = $signature; continue }
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
            $completed[$key] = $signature
            [void]$failures.Remove($key)
            Write-ForwardLog ('Copied ' + $file.Name + ' -> ' + [IO.Path]::GetFileName($destination))
        } catch {
            $failed = $true
            $failure = $_.Exception.Message
            if ($failures[$key] -ne $failure) {
                Write-ForwardLog ('Retry ' + $file.Name + ': ' + $failure)
                Write-Warning ($file.Name + ': ' + $failure)
                $failures[$key] = $failure
            }
        } finally {
            if ($source) { $source.Dispose() }
            if ($partial -and (Test-Path -LiteralPath $partial)) { [IO.File]::Delete($partial) }
        }
    }
    foreach ($cache in @($observed, $completed, $failures)) {
        foreach ($key in @($cache.Keys)) {
            if (-not $seen.ContainsKey($key)) { $cache.Remove($key) }
        }
    }
    return -not $failed
}

if (-not $Watch) {
    if (-not (Invoke-ForwardPass)) { exit 1 }
    exit 0
}
Write-ForwardLog ('Watching; interval=' + $PollSeconds + 's; minimum age=' + $MinimumAgeSeconds + 's')
$lastError = $null
while ($true) {
    try {
        if (-not (Test-Path -LiteralPath $DocumentsFolder -PathType Container)) { throw 'Folder Documents tidak tersedia.' }
        [void][IO.Directory]::CreateDirectory($InboxFolder)
        [void](Invoke-ForwardPass)
        $lastError = $null
    } catch {
        if ($lastError -ne $_.Exception.Message) {
            Write-ForwardLog ('Retry folder: ' + $_.Exception.Message)
            $lastError = $_.Exception.Message
        }
    }
    Start-Sleep -Seconds $PollSeconds
}
