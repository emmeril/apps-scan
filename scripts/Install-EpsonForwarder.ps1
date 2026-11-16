param(
    [Parameter(Mandatory=$true)][string]$DocumentsFolder,
    [string]$InboxFolder = 'C:\ProgramData\ScanInbox\Incoming',
    [string]$InstallFolder = 'C:\ProgramData\ScanInbox\Tools',
    [string]$LogFile = 'C:\ProgramData\ScanInbox\Logs\epson-forward.log'
)
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $DocumentsFolder -PathType Container)) { throw 'Pilih Documents milik akun yang menjalankan ScanSmart.' }
foreach ($value in @($DocumentsFolder, $InboxFolder, $InstallFolder, $LogFile)) {
    if (-not [IO.Path]::IsPathRooted($value) -or $value.Contains('"')) { throw 'Gunakan path absolut tanpa tanda kutip di dalam nama folder.' }
}
[void][IO.Directory]::CreateDirectory($InstallFolder)
[void][IO.Directory]::CreateDirectory($InboxFolder)
$directoryAcl = New-Object Security.AccessControl.DirectorySecurity
$directoryAcl.SetAccessRuleProtection($true, $false)
foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
    $identity = New-Object Security.Principal.SecurityIdentifier($sid)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $directoryAcl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $InstallFolder -AclObject $directoryAcl
$scriptPath = Join-Path $InstallFolder 'Forward-EpsonScans.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Forward-EpsonScans.ps1') -Destination $scriptPath -Force
$fileAcl = New-Object Security.AccessControl.FileSecurity
$fileAcl.SetAccessRuleProtection($true, $false)
foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
    $identity = New-Object Security.Principal.SecurityIdentifier($sid)
    $fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
}
Set-Acl -LiteralPath $scriptPath -AclObject $fileAcl
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -DocumentsFolder "{1}" -InboxFolder "{2}" -LogFile "{3}"' -f $scriptPath, $DocumentsFolder, $InboxFolder, $LogFile
$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments
$triggers = @(
    (New-ScheduledTaskTrigger -AtStartup),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1))
)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'ScanInbox-EpsonPdfForwarder' -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'ScanInbox-EpsonPdfForwarder'
Write-Output 'Penerusan PDF Epson aktif. Periksa Task Scheduler > ScanInbox-EpsonPdfForwarder.'
