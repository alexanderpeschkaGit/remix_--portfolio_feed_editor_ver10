<#
.SYNOPSIS
    PowerShell runner for the Repomix Codebase Bundler.

.DESCRIPTION
    Wraps repomix.bat so that PowerShell users can execute `.\repomix v2` or
    `.\repomix.ps1 v2` cleanly without encountering PowerShell path-resolution errors
    or global CLI binary confusion.

.PARAMETER TargetFolder
    The destination folder name or tag (e.g. 'v2', 'repomix_v2', or CLI flags like '--no-security-check').
    Folder names are automatically normalized with the 'repomix_' prefix by repomix.bat.

.PARAMETER RemainingArgs
    Additional arguments and flags forwarded to repomix (e.g. '--no-security-check', '--include', etc.).

.EXAMPLE
    .\repomix v2
    Bundles the repository into repomix_v2/ and runs the 130k character audit.

.EXAMPLE
    .\repomix.ps1 v2 --no-security-check
    Bundles the repository into repomix_v2/ skipping the security scan.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $false, HelpMessage = "Target export directory or version tag (e.g. 'v2', 'repomix_v2', or CLI flags)")]
    [string]$TargetFolder,

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
    $scriptDir = (Get-Location).Path
}

$batPath = Join-Path $scriptDir "repomix.bat"
if (-not (Test-Path $batPath)) {
    Write-Error "[FEHLER] repomix.bat wurde im Verzeichnis '$scriptDir' nicht gefunden."
    exit 1
}

# Forward arguments cleanly to repomix.bat
$forwardArgs = @()
if ($TargetFolder) {
    $forwardArgs += $TargetFolder
}
if ($RemainingArgs) {
    $forwardArgs += $RemainingArgs
}

if ($forwardArgs.Count -gt 0) {
    & cmd.exe /c "`"$batPath`"" $forwardArgs
} else {
    & cmd.exe /c "`"$batPath`""
}

$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    exit $exitCode
}
