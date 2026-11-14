#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ServerIP,
    [Parameter(Mandatory=$true)][string]$PackagePath,
    [ValidateRange(1,65535)][int]$Port = 8080,
    [ValidatePattern('^[A-Za-z0-9_-]+$')][string]$SiteName = 'ScanInbox',
    [string]$ApplicationPath = 'C:\inetpub\ScanInbox',
    [string]$StorageRoot = 'C:\ProgramData\ScanInbox'
)
$ErrorActionPreference = 'Stop'
Import-Module WebAdministration
$address = [Net.IPAddress]::Parse($ServerIP)
if ($address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'Gunakan IPv4 server.' }
if (-not (Get-NetIPAddress -IPAddress $ServerIP -ErrorAction SilentlyContinue)) { throw 'IP tersebut tidak terpasang di server ini.' }
$appRoot = [IO.Path]::GetFullPath($ApplicationPath).TrimEnd('\')
$storage = [IO.Path]::GetFullPath($StorageRoot).TrimEnd('\')
$package = (Resolve-Path -LiteralPath $PackagePath).Path
$dotnet = Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'
$modulePath = Join-Path $env:ProgramFiles 'IIS\Asp.Net Core Module\V2\aspnetcorev2.dll'
if (-not (Test-Path -LiteralPath $dotnet) -or -not (Test-Path -LiteralPath $modulePath)) { throw 'Pasang .NET 10 Hosting Bundle terlebih dahulu.' }
if ((Get-WindowsFeature Web-AppInit).InstallState -ne 'Installed') { throw 'Pasang fitur IIS Web-AppInit terlebih dahulu.' }
if (Test-Path "IIS:\Sites\$SiteName") { throw 'Situs sudah ada. Script ini hanya untuk pemasangan pertama.' }
if (Test-Path "IIS:\AppPools\$SiteName") { throw 'Application Pool sudah ada. Periksa pemasangan sebelumnya.' }
if (Test-Path -LiteralPath $appRoot) { throw 'Folder aplikasi sudah ada; gunakan lokasi baru agar file lama tidak tertimpa.' }
if (Test-Path -LiteralPath $storage) { throw 'Folder penyimpanan sudah ada; jangan menimpa data atau kredensial lama.' }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw 'Port sedang dipakai. Pilih port lain.' }
if ($storage.StartsWith($appRoot+'\', [StringComparison]::OrdinalIgnoreCase) -or $storage -eq $appRoot) { throw 'StorageRoot harus berada di luar folder aplikasi.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($package)
try {
    $names = @($zip.Entries | ForEach-Object {$_.FullName.Replace('\','/')})
    foreach ($required in @('ScanInbox.dll','web.config','wwwroot/vendor/pdfjs/pdf.mjs')) {
        if ($required -notin $names) { throw ('Paket IIS tidak lengkap: '+$required) }
    }
    foreach ($entry in $zip.Entries) {
        $target = [IO.Path]::GetFullPath((Join-Path $appRoot $entry.FullName))
        if (-not $target.StartsWith($appRoot+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Paket mengandung path di luar folder aplikasi.' }
    }
} finally { $zip.Dispose() }

Backup-WebConfiguration -Name ($SiteName+'-BeforeInstall-'+(Get-Date -Format 'yyyyMMdd-HHmmss')) | Out-Null
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
Expand-Archive -LiteralPath $package -DestinationPath $appRoot
$incoming = Join-Path $storage 'Incoming'
$data = Join-Path $storage 'Data'
$setup = Join-Path $storage 'Setup'
New-Item -ItemType Directory -Path $incoming,$data,$setup -Force | Out-Null
New-WebAppPool -Name $SiteName | Out-Null
$pool = "IIS:\AppPools\$SiteName"
Set-ItemProperty $pool -Name managedRuntimeVersion -Value ''
Set-ItemProperty $pool -Name enable32BitAppOnWin64 -Value $false
Set-ItemProperty $pool -Name startMode -Value AlwaysRunning
Set-ItemProperty $pool -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
Set-ItemProperty $pool -Name processModel.identityType -Value ApplicationPoolIdentity

function Set-StoragePermissions([string]$Path, [string]$PoolAccess) {
    $grants = @('*S-1-5-32-544:(OI)(CI)F','*S-1-5-18:(OI)(CI)F')
    if ($PoolAccess) { $grants += "IIS AppPool\${SiteName}:(OI)(CI)$PoolAccess" }
    & icacls.exe $Path /inheritance:r /grant:r @grants | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ('Pengaturan izin folder gagal: '+$Path) }
}
Set-StoragePermissions $incoming 'RX'
Set-StoragePermissions $data 'M'
Set-StoragePermissions $setup ''
& icacls.exe $appRoot /grant "IIS AppPool\${SiteName}:(OI)(CI)RX" /T | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Pengaturan izin folder aplikasi gagal.' }
$config = [ordered]@{
    AllowedHosts = "$ServerIP;localhost;127.0.0.1"
    Storage = [ordered]@{InboxPath=$incoming;DataPath=$data;PollSeconds=5;MinimumAgeSeconds=10;MaximumFileMegabytes=100}
    Security = @{RequireHttps=$false}
}
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $appRoot 'appsettings.Local.json') -Encoding UTF8

$bytes = New-Object byte[] 24
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($bytes) } finally { $random.Dispose() }
$password = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$start = New-Object Diagnostics.ProcessStartInfo
$start.FileName = $dotnet
$start.Arguments = '"'+(Join-Path $appRoot 'ScanInbox.dll')+'" --create-admin admin'
$start.WorkingDirectory = $appRoot
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$bootstrap = [Diagnostics.Process]::Start($start)
$bootstrap.StandardInput.WriteLine($password)
$bootstrap.StandardInput.WriteLine($password)
$bootstrap.StandardInput.Close()
$bootstrap.StandardOutput.ReadToEnd() | Out-Null
$errorText = $bootstrap.StandardError.ReadToEnd()
$bootstrap.WaitForExit()
if ($bootstrap.ExitCode -ne 0) { throw ('Pembuatan admin gagal: '+$errorText) }
$url = 'http://'+$ServerIP+':'+$Port
$credentialPath = Join-Path $setup 'admin-first-login.json'
@{url=$url;username='admin';password=$password} | ConvertTo-Json | Set-Content -LiteralPath $credentialPath -Encoding UTF8
$password = $null

New-Website -Name $SiteName -IPAddress $ServerIP -Port $Port -PhysicalPath $appRoot -ApplicationPool $SiteName | Out-Null
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.applicationHost/sites/site[@name='$SiteName']/application[@path='/']" -Name preloadEnabled -Value $true
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName -Filter 'system.webServer/applicationInitialization' -Name doAppInitAfterRestart -Value $true
New-NetFirewallRule -Name ($SiteName+'-HTTP-LAN') -DisplayName ($SiteName+' HTTP dari jaringan lokal') -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -LocalAddress $ServerIP -RemoteAddress LocalSubnet -Profile Private,Domain | Out-Null
Start-Website -Name $SiteName
[pscustomobject]@{Url=$url;Incoming=$incoming;Data=$data;AdminCredentialFile=$credentialPath;Site=$SiteName;Protocol='HTTP'}
