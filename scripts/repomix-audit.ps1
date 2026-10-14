param(
    [string]$OutputDir = "repomix-output"
)

# Dynamically resolve project root (directory containing package.json)
$repoRoot = $PSScriptRoot
while (-not (Test-Path (Join-Path $repoRoot "package.json")) -and (Split-Path $repoRoot)) {
    $repoRoot = Split-Path $repoRoot
}

$targetDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir
} else {
    Join-Path $repoRoot $OutputDir
}

if (-not (Test-Path $targetDir)) {
    Write-Host "Verzeichnis '$targetDir' existiert nicht." -ForegroundColor Yellow
    exit 0
}

$files = Get-ChildItem -Path $targetDir -File | Sort-Object Name

if (-not $files) {
    Write-Host "Keine Dateien in '$targetDir' gefunden." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " REPOMIX CHUNK AUDIT (Maximal-Limit: 130.000 Zeichen)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

$allValid = $true
$summary = foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw -Encoding utf8
    $charCount = if ($null -ne $content) { $content.Length } else { 0 }
    $isValid = $charCount -le 130000
    if (-not $isValid) {
        $allValid = $false
    }
    
    [PSCustomObject]@{
        Datei   = $file.Name
        Zeichen = "{0,8:N0}" -f $charCount
        Bytes   = "{0,8:N0}" -f $file.Length
        Status  = if ($isValid) { "[OK] <= 130k" } else { "[WARN] > 130k" }
    }
}

$summary | Format-Table -AutoSize

Write-Host "------------------------------------------------------------------------" -ForegroundColor Cyan
if ($allValid) {
    Write-Host "Ergebnis: Alle $($files.Count) Chunks liegen sicher unter dem Limit von 130.000 Zeichen." -ForegroundColor Green
} else {
    Write-Host "Achtung: Mindestens ein Chunk ueberschreitet das Limit von 130.000 Zeichen!" -ForegroundColor Red
}
Write-Host "Speicherort: $targetDir" -ForegroundColor Gray
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""
