# UTF-8 buffer-safe synchronization of updated skills across all projects and global Antigravity config
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$sourceSkillsDir = "Y:\projekte2026\website\remix_--portfolio_feed_editor_ver10\.agents\skills"
$sourceWorkflows = "Y:\projekte2026\website\remix_--portfolio_feed_editor_ver10\.agents\WORKFLOWS.md"

if (-not (Test-Path $sourceSkillsDir)) {
    throw "Source skills directory not found: $sourceSkillsDir"
}

# 1. Global Antigravity skills repository
$globalSkillsTarget = "C:\Users\freak\.gemini\config\skills"

# 2. Project target directories (.agents)
$projectTargets = @(
    "Y:\projekte2026\website\portfolio-feed-editor-web",
    "Y:\projekte2026\website\gitTrans\Portfolio_VJ_Brave_V2_0",
    "Y:\projekte2026\website\gitTrans\_harness_template",
    "Y:\projekte2026\website\gitTrans\githubgeminibridge",
    "Y:\projekte2026\website\remix_--portfolio_feed_editor_ver10\refactor2_editor",
    "Y:\projekte2026\website\portfolio-backend-handoff",
    "Y:\projekte2026\Kleinigkeiten\c4dWorkfilesAntigravity"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "SYNCHRONIZING SKILLS TO GLOBAL & PROJECTS" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Sync to Global Antigravity config (only skill folders)
Write-Host "`n>>> Syncing to Global Antigravity Config: $globalSkillsTarget" -ForegroundColor Yellow
if (-not (Test-Path $globalSkillsTarget)) {
    New-Item -ItemType Directory -Path $globalSkillsTarget -Force | Out-Null
}

$skillDirs = Get-ChildItem -Path $sourceSkillsDir -Directory
foreach ($dir in $skillDirs) {
    $targetDir = Join-Path $globalSkillsTarget $dir.Name
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    # Copy all files recursively
    Copy-Item -Path "$($dir.FullName)\*" -Destination $targetDir -Recurse -Force
    Write-Host "  [GLOBAL] Synced skill folder: $($dir.Name)" -ForegroundColor Green
}

# Sync to Projects
foreach ($proj in $projectTargets) {
    Write-Host "`n>>> Syncing to Project: $proj" -ForegroundColor Yellow
    $projAgents = Join-Path $proj ".agents"
    if (-not (Test-Path $projAgents)) {
        New-Item -ItemType Directory -Path $projAgents -Force | Out-Null
    }

    $projSkills = Join-Path $projAgents "skills"
    if (-not (Test-Path $projSkills)) {
        New-Item -ItemType Directory -Path $projSkills -Force | Out-Null
    }

    # 1. Copy all skill subdirectories
    foreach ($dir in $skillDirs) {
        $targetDir = Join-Path $projSkills $dir.Name
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item -Path "$($dir.FullName)\*" -Destination $targetDir -Recurse -Force
    }

    # 2. Copy root skill md files (excluding .bak)
    $rootMdFiles = Get-ChildItem -Path $sourceSkillsDir -File -Filter "*.md"
    foreach ($f in $rootMdFiles) {
        Copy-Item -Path $f.FullName -Destination $projSkills -Force
    }

    # 3. Sync WORKFLOWS.md
    if (Test-Path $sourceWorkflows) {
        Copy-Item -Path $sourceWorkflows -Destination (Join-Path $projAgents "WORKFLOWS.md") -Force
        Write-Host "  [WORKFLOWS] Synced WORKFLOWS.md" -ForegroundColor Green
    }

    Write-Host "  [OK] Successfully synchronized all skills to $proj" -ForegroundColor Green
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "VERIFICATION AUDIT" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Verify critical files exist in all targets
$criticalFiles = @(
    "plan\SKILL.md",
    "exec\SKILL.md",
    "review\SKILL.md",
    "solve\SKILL.md",
    "delegate\SKILL.md",
    "exec-wave\SKILL.md",
    "zip-clean\SKILL.md"
)

$allCheckTargets = @($globalSkillsTarget) + ($projectTargets | ForEach-Object { Join-Path $_ ".agents\skills" })

$allPassed = $true
foreach ($target in $allCheckTargets) {
    Write-Host "`nAuditing: $target"
    foreach ($cf in $criticalFiles) {
        $checkPath = Join-Path $target $cf
        if (Test-Path $checkPath) {
            $len = (Get-Item $checkPath).Length
            Write-Host "  [PASS] $cf ($len bytes)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Missing: $cf" -ForegroundColor Red
            $allPassed = $false
        }
    }
}

if ($allPassed) {
    Write-Host "`nAll skills verified successfully across all targets!" -ForegroundColor Cyan
} else {
    Write-Warning "Some files failed verification!"
}
