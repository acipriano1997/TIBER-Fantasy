param(
    [switch]$Push,
    [switch]$AllowMain
)

$ErrorActionPreference = "Stop"

$branch = git branch --show-current
$revision = git rev-parse HEAD
$status = git status --porcelain
$origin = git remote get-url origin

Write-Host "Branch: $branch"
Write-Host "Revision: $revision"
Write-Host "Origin: $origin"

if ($status) {
    Write-Host "Working tree is not clean. Sync blocked."
    exit 1
}

if ($branch -eq "main" -and -not $AllowMain) {
    Write-Host "Direct main push blocked."
    Write-Host "Use an integration/feature/fix/chore branch."
    exit 1
}

if (-not $Push) {
    Write-Host "Preview only. No push performed."
    Write-Host "Re-run with -Push when ready."
    exit 0
}

git push -u origin $branch

if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub sync: FAIL"
    exit $LASTEXITCODE
}

Write-Host "GitHub sync: PASS"
