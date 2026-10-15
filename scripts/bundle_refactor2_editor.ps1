# scripts/bundle_refactor2_editor.ps1
# Copies all required files for refactoring MediaVariantsModal, LightboxModal, and FeedPostCard
# along with skills, rules, linked docs, and context into refactor2_editor/

$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
if (-not $baseDir) {
    $baseDir = (Get-Location).Path
}

$destRoot = Join-Path $baseDir "refactor2_editor"

$files = @(
    "src/components/modals/MediaVariantsModal.tsx",
    "src/components/modals/LightboxModal.tsx",
    "src/components/feed/FeedPostCard.tsx",
    "src/components/modals/CustomThumbnailModal.tsx",
    "src/components/gallery/ThumbnailGalleryGrid.tsx",
    "src/App.tsx",
    "src/constants.ts",
    "src/types.ts",
    "src/hooks/useLightboxState.ts",
    "src/hooks/useMediaInteraction.ts",
    "src/hooks/useMediaUploads.ts",
    "src/hooks/uploadImageFlow.ts",
    "src/hooks/uploadVideoFlow.ts",
    "src/hooks/usePostActions.ts",
    "src/hooks/useImageDimensions.ts",
    "src/hooks/useR2Maintenance.ts",
    "src/utils/mediaHelpers.ts",
    "src/server/mediaVariantsRoutes.ts",
    "package.json",
    "tsconfig.json",
    "AGENTS.md",
    "GEMINI.md",
    ".clinerules",
    ".windsurfrules",
    "docs/HOWTOUSE.md",
    ".agents/WORKFLOWS.md",
    ".agents/rules/app-architecture.md",
    ".agents/rules/autorun.md",
    ".agents/rules/bio-display.md",
    ".agents/rules/representation-r2.md"
)

# Collect all skills in .agents/skills
$skillsDir = Join-Path $baseDir ".agents\skills"
$skillFiles = Get-ChildItem -Path $skillsDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($baseDir.Length + 1).Replace('\', '/')
    $rel
}

$allFiles = ($files + $skillFiles) | Select-Object -Unique

Write-Host "Target destination: $destRoot" -ForegroundColor Cyan
if (-not (Test-Path $destRoot)) {
    New-Item -ItemType Directory -Path $destRoot -Force | Out-Null
}

$copied = 0
foreach ($relPath in $allFiles) {
    $srcPath = Join-Path $baseDir ($relPath.Replace('/', '\'))
    if (Test-Path $srcPath) {
        $destPath = Join-Path $destRoot ($relPath.Replace('/', '\'))
        $destDir = Split-Path $destPath -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path $srcPath -Destination $destPath -Force
        $copied++
        Write-Host " [COPIED] $relPath" -ForegroundColor Green
    } else {
        Write-Warning "File not found: $srcPath"
    }
}

Write-Host "`nTotal copied files: $copied" -ForegroundColor Cyan
