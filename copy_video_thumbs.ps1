# Temporary script: Copy Instagram video thumbnails (matching .jpg for each .mp4)
$sourceDir = "Y:\projekte2026\website\portfolio_feed_editor_ver4\data\instagram\vijay_sikanda"
$destDir   = "Y:\projekte2026\website\remix_--portfolio_feed_editor_ver10\tmp\instaVideoThumbs"

# Create destination folder if it doesn't exist
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$copied = 0
$skipped = 0

Get-ChildItem -Path $sourceDir -Filter "*.mp4" | ForEach-Object {
    $baseName = $_.BaseName  # e.g. "2016-11-19_01-49-06_UTC"
    $jpgPath  = Join-Path $sourceDir "$baseName.jpg"

    if (Test-Path $jpgPath) {
        Copy-Item -Path $jpgPath -Destination $destDir -Force
        Write-Host "Copied: $baseName.jpg"
        $copied++
    } else {
        Write-Host "SKIPPED (no .jpg): $($_.Name)"
        $skipped++
    }
}

Write-Host ""
Write-Host "=== Done ==="
Write-Host "Copied: $copied"
Write-Host "Skipped: $skipped"
