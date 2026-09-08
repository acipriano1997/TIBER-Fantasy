$ErrorActionPreference = "Stop"

Write-Host "=== LOCAL PREFLIGHT ==="

$repo = git rev-parse --show-toplevel
$branch = git branch --show-current
$revision = git rev-parse HEAD
$gitVersion = git --version
$status = git status --porcelain

Write-Host "Repository: $repo"
Write-Host "Branch: $branch"
Write-Host "Revision: $revision"
Write-Host "Git: $gitVersion"

if ($status) {
    Write-Host "Working tree: DIRTY"
    Write-Host $status
} else {
    Write-Host "Working tree: CLEAN"
}

Write-Host "Focused tests: NOT RUN"
Write-Host "Broad tests: NOT RUN"
Write-Host "Certification gates: NOT RUN"

Write-Host "=== END PREFLIGHT ==="
