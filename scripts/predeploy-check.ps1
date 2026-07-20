<#
.SYNOPSIS
    Local predeployment validation for this project (see DEPLOYMENT_PLAYBOOK.md, step 3).

.DESCRIPTION
    Read-only validation only. This script NEVER commits, pushes, deploys, connects to a
    VPS, or touches Supabase. It runs the project's own configured lint / type-check /
    test / build commands (detected from package.json) and reports a clear PASS/FAIL
    summary. It does not print environment-variable values.

.USAGE
    powershell -File scripts\predeploy-check.ps1

    Run from anywhere inside the repo, or from the repo root. Exits with code 0 on
    success, non-zero on the first failing required check.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$script:results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Name, [string]$Status, [string]$Detail)
    $script:results.Add([pscustomobject]@{ Check = $Name; Status = $Status; Detail = $Detail })
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "--- $Title ---" -ForegroundColor Yellow
}

function Fail-Deploy {
    param([string]$Name, [string]$Detail)
    Add-Result -Name $Name -Status 'FAIL' -Detail $Detail
    Write-Host ""
    Write-Host "==================== PREDEPLOY CHECK: FAILED ====================" -ForegroundColor Red
    Write-Host "Failed check: $Name" -ForegroundColor Red
    Write-Host $Detail -ForegroundColor Red
    Write-Host ""
    $script:results | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host "No commit, push, or deploy action was taken by this script." -ForegroundColor DarkYellow
    exit 1
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Predeployment Validation - read-only, no commit/push/deploy" -ForegroundColor Cyan
Write-Host " Started: $(Get-Date -Format o)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Confirm project root
# ---------------------------------------------------------------------------
Write-Section 'Project root'
$pkgPath = Join-Path (Get-Location) 'package.json'
if (-not (Test-Path $pkgPath)) {
    Fail-Deploy 'Project root' "package.json not found in '$(Get-Location)'. Run this script from the repository root."
}
try {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
} catch {
    Fail-Deploy 'Project root' "package.json in '$(Get-Location)' could not be parsed as JSON."
}
$expectedName = 'tanstack_start_ts'
if ($pkg.name -ne $expectedName) {
    Fail-Deploy 'Project root' "package.json 'name' is '$($pkg.name)', expected '$expectedName'. Wrong directory?"
}
Write-Host "Confirmed project root: $(Get-Location)"
Add-Result -Name 'Project root' -Status 'PASS' -Detail (Get-Location).Path

# ---------------------------------------------------------------------------
# 2. Git branch
# ---------------------------------------------------------------------------
Write-Section 'Git branch'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail-Deploy 'Git branch' 'git is not installed or not on PATH.'
}
$branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $branch) {
    Fail-Deploy 'Git branch' "Not a git repository (or HEAD is unborn) in '$(Get-Location)'."
}
Write-Host "Current branch: $branch"
Add-Result -Name 'Git branch' -Status 'PASS' -Detail $branch

# ---------------------------------------------------------------------------
# 3. Git status
# ---------------------------------------------------------------------------
Write-Section 'Git status'
$statusRaw = @(& git status --porcelain=v1 2>$null)
if ($statusRaw.Count -eq 0) {
    Write-Host "  (working tree clean)"
} else {
    foreach ($line in $statusRaw) { Write-Host "  $line" }
}
$detail = if ($statusRaw.Count -eq 0) { 'clean' } else { "$($statusRaw.Count) changed file(s)" }
Add-Result -Name 'Git status' -Status 'INFO' -Detail $detail

# ---------------------------------------------------------------------------
# 4. Unresolved merge conflicts
# ---------------------------------------------------------------------------
Write-Section 'Merge conflicts'
$conflictCodes = @('UU', 'AA', 'DD', 'AU', 'UA', 'UD', 'DU')
$conflicts = $statusRaw | Where-Object {
    $code = $_.Substring(0, [Math]::Min(2, $_.Length))
    $conflictCodes -contains $code
}
if ($conflicts) {
    $conflictList = $conflicts -join "`n"
    Fail-Deploy 'Merge conflicts' "Unresolved merge conflicts detected:`n$conflictList`nResolve these before validating or deploying."
}
Write-Host "No unresolved merge conflicts detected."
Add-Result -Name 'Merge conflicts' -Status 'PASS' -Detail 'None detected'

# ---------------------------------------------------------------------------
# 5. Package manager detection
# ---------------------------------------------------------------------------
Write-Section 'Package manager'
$declaredPm = $pkg.packageManager
if (-not $declaredPm -or $declaredPm -notmatch '^pnpm@') {
    Fail-Deploy 'Package manager' "package.json 'packageManager' is '$declaredPm' - expected a pinned pnpm version (e.g. 'pnpm@9.15.0')."
}
if (-not (Test-Path (Join-Path (Get-Location) 'pnpm-lock.yaml'))) {
    Fail-Deploy 'Package manager' 'pnpm-lock.yaml not found. This project requires pnpm - do not substitute npm/yarn/bun.'
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Fail-Deploy 'Package manager' "pnpm is not installed or not on PATH. Run 'corepack enable' first."
}
Write-Host "Detected package manager: pnpm ($declaredPm), pnpm-lock.yaml present."
Add-Result -Name 'Package manager' -Status 'PASS' -Detail "pnpm ($declaredPm)"

# ---------------------------------------------------------------------------
# 6. Environment file presence (no values printed)
# ---------------------------------------------------------------------------
Write-Section 'Environment file'
$envPresent = Test-Path (Join-Path (Get-Location) '.env')
Write-Host "  .env present: $envPresent (values are never displayed by this script)"
Add-Result -Name 'Environment file' -Status 'INFO' -Detail "present=$envPresent"

# ---------------------------------------------------------------------------
# Helper to run a pnpm-based step and stop on failure
# ---------------------------------------------------------------------------
function Invoke-RequiredStep {
    param([string]$Name, [string[]]$PnpmArgs)
    Write-Section $Name
    Write-Host "> pnpm $($PnpmArgs -join ' ')"
    & pnpm @PnpmArgs
    if ($LASTEXITCODE -ne 0) {
        Fail-Deploy $Name "'pnpm $($PnpmArgs -join ' ')' exited with code $LASTEXITCODE. Fix the underlying issue - do not bypass this check."
    }
    Add-Result -Name $Name -Status 'PASS' -Detail 'OK'
}

# ---------------------------------------------------------------------------
# 7. Lint
# ---------------------------------------------------------------------------
if ($pkg.scripts.PSObject.Properties.Name -contains 'lint') {
    Invoke-RequiredStep -Name 'Lint (pnpm lint)' -PnpmArgs @('lint')
} else {
    Write-Section 'Lint'
    Write-Host "No 'lint' script found in package.json - skipping." -ForegroundColor DarkYellow
    Add-Result -Name 'Lint' -Status 'SKIPPED' -Detail 'No "lint" script in package.json'
}

# ---------------------------------------------------------------------------
# 8. Type check
# ---------------------------------------------------------------------------
Write-Section 'Type check'
$hasTypecheckScript = ($pkg.scripts.PSObject.Properties.Name -contains 'typecheck') -or
                       ($pkg.scripts.PSObject.Properties.Name -contains 'type-check')
if ($hasTypecheckScript) {
    $tcScriptName = if ($pkg.scripts.PSObject.Properties.Name -contains 'typecheck') { 'typecheck' } else { 'type-check' }
    Invoke-RequiredStep -Name "Type check (pnpm $tcScriptName)" -PnpmArgs @('run', $tcScriptName)
} elseif (Test-Path (Join-Path (Get-Location) 'tsconfig.json')) {
    Write-Host "No 'typecheck' script in package.json. Falling back to 'pnpm exec tsc --noEmit -p tsconfig.json'." -ForegroundColor DarkYellow
    Write-Host "> pnpm exec tsc --noEmit -p tsconfig.json"
    & pnpm exec tsc --noEmit -p tsconfig.json
    if ($LASTEXITCODE -ne 0) {
        Fail-Deploy 'Type check' "'tsc --noEmit' exited with code $LASTEXITCODE."
    }
    Add-Result -Name 'Type check' -Status 'PASS' -Detail 'via tsc --noEmit (no package.json script)'
} else {
    Write-Host "No typecheck script and no tsconfig.json found - skipping." -ForegroundColor DarkYellow
    Add-Result -Name 'Type check' -Status 'SKIPPED' -Detail 'No typecheck script and no tsconfig.json'
}

# ---------------------------------------------------------------------------
# 9. Unit tests
# ---------------------------------------------------------------------------
if ($pkg.scripts.PSObject.Properties.Name -contains 'test:unit') {
    Invoke-RequiredStep -Name 'Unit tests (pnpm test:unit)' -PnpmArgs @('test:unit')
} else {
    Write-Section 'Unit tests'
    Write-Host "No 'test:unit' script found in package.json - skipping." -ForegroundColor DarkYellow
    Add-Result -Name 'Unit tests' -Status 'SKIPPED' -Detail 'No "test:unit" script in package.json'
}

# Informational only: E2E tests target a deployed URL and need live credentials,
# so they are intentionally NOT run here - see DEPLOYMENT_PLAYBOOK.md section 10.
Add-Result -Name 'E2E tests (pnpm test:e2e)' -Status 'SKIPPED' -Detail 'Requires a deployed URL + live credentials; run post-deploy, not pre-deploy'

# ---------------------------------------------------------------------------
# 10. Production build
# ---------------------------------------------------------------------------
if ($pkg.scripts.PSObject.Properties.Name -contains 'build') {
    Invoke-RequiredStep -Name 'Production build (pnpm build)' -PnpmArgs @('build')
} else {
    Fail-Deploy 'Production build' "No 'build' script in package.json - cannot validate a deployable artifact."
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==================== PREDEPLOY CHECK: PASSED ====================" -ForegroundColor Green
$script:results | Format-Table -AutoSize | Out-String | Write-Host
Write-Host "This script only validates. It does not commit, push, deploy, or access Supabase/the VPS." -ForegroundColor Cyan
Write-Host "Finished: $(Get-Date -Format o)" -ForegroundColor Cyan
exit 0
