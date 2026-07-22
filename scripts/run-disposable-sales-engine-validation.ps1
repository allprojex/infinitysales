$ErrorActionPreference = "Stop"

$organizationId = "mxnqdrbjirpwmyldablj"
$productionProjectRef = "vcgtjdkpgbkyzrbonkbs"
$projectName = "codex-sales-engine-validation-$(Get-Date -Format 'yyyyMMddHHmmss')"
$alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
$randomBytes = New-Object byte[] 40
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($randomBytes)
$randomGenerator.Dispose()
$databasePassword = -join ($randomBytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
$projectRef = $null
$appProcess = $null
$cliWorkdir = $null
$workspacePath = [System.IO.Path]::GetFullPath((Get-Location).Path)
$timings = [ordered]@{}
$results = [ordered]@{
  project_name       = $projectName
  project_ref        = $null
  migration          = "NOT_RUN"
  types              = "NOT_RUN"
  unit_tests         = "NOT_RUN"
  build              = "NOT_RUN"
  runtime_validation = "NOT_RUN"
  baseline_workaround = "NOT_RUN"
  cleanup            = "NOT_RUN"
  failure            = $null
  runtime_output     = $null
}

function Invoke-Captured {
  param([string]$Label, [scriptblock]$Command)
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Command 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  $watch.Stop()
  $script:timings[$Label] = [math]::Round($watch.Elapsed.TotalSeconds, 2)
  $safeOutput = $output.Replace($script:databasePassword, "[redacted]")
  return [pscustomobject]@{ ExitCode = $exitCode; Output = $safeOutput }
}

function Stop-WorkspaceViteListener {
  param([switch]$RejectForeignListener)
  $listeners = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    $isWorkspaceVite = $processInfo.CommandLine -like "*$script:workspacePath*" -and
      $processInfo.CommandLine -like "*vite*"
    if ($isWorkspaceVite) {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    } elseif ($RejectForeignListener) {
      throw "PORT_3000_IS_OWNED_BY_ANOTHER_PROCESS"
    }
  }
}

try {
  $create = Invoke-Captured "project_create_seconds" {
    supabase projects create $projectName `
      --org-id $organizationId `
      --db-password $databasePassword `
      --region eu-west-1 `
      --size micro `
      --output json `
      --yes
  }
  if ($create.ExitCode -ne 0) { throw "PROJECT_CREATE_FAILED`n$($create.Output)" }
  $projectsAfterCreate = supabase projects list --output json 2>$null | ConvertFrom-Json
  $created = $projectsAfterCreate | Where-Object { $_.name -eq $projectName } | Select-Object -First 1
  $projectRef = [string]$created.ref
  if (-not $projectRef -or $projectRef -eq $productionProjectRef) {
    throw "PROJECT_CREATE_RETURNED_INVALID_REF`n$($create.Output)"
  }
  $results.project_ref = $projectRef
  Write-Output "DISPOSABLE_PROJECT_CREATED=$projectRef"

  $readyWatch = [System.Diagnostics.Stopwatch]::StartNew()
  $ready = $false
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    $projects = supabase projects list --output json 2>$null | ConvertFrom-Json
    $entry = $projects | Where-Object { $_.ref -eq $projectRef }
    if ($entry.status -eq "ACTIVE_HEALTHY") { $ready = $true; break }
    Start-Sleep -Seconds 10
  }
  $readyWatch.Stop()
  $timings.project_ready_seconds = [math]::Round($readyWatch.Elapsed.TotalSeconds, 2)
  if (-not $ready) { throw "DISPOSABLE_PROJECT_DID_NOT_BECOME_READY" }
  Write-Output "DISPOSABLE_PROJECT_READY=true"

  $keysRaw = supabase projects api-keys --project-ref $projectRef --output json 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "API_KEYS_FAILED" }
  $keys = $keysRaw | ConvertFrom-Json
  $publishableKey = [string](
    ($keys | Where-Object { $_.name -in @("anon", "publishable") } | Select-Object -First 1).api_key
  )
  $serviceKey = [string](
    ($keys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1).api_key
  )
  if (-not $publishableKey -or -not $serviceKey) { throw "REQUIRED_API_KEYS_NOT_FOUND" }

  $cliWorkdir = Join-Path $env:TEMP "sales-engine-cli-$projectRef"
  New-Item -ItemType Directory -Path $cliWorkdir -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path (Get-Location) "supabase") `
    -Destination (Join-Path $cliWorkdir "supabase") `
    -Recurse
  $copiedLinkMetadata = Join-Path $cliWorkdir "supabase\.temp"
  if (Test-Path $copiedLinkMetadata) {
    Remove-Item -LiteralPath $copiedLinkMetadata -Recurse -Force
  }
  $temporaryConfigPath = Join-Path $cliWorkdir "supabase\config.toml"
  $temporaryConfig = Get-Content -Raw $temporaryConfigPath
  $temporaryConfig = $temporaryConfig -replace '(?m)^project_id\s*=\s*"[^"]*"', "project_id = `"$projectRef`""
  [System.IO.File]::WriteAllText(
    $temporaryConfigPath,
    $temporaryConfig,
    (New-Object System.Text.UTF8Encoding($false))
  )
  if ((Get-Content -Raw $temporaryConfigPath) -notmatch "project_id\s*=\s*`"$projectRef`"") {
    throw "DISPOSABLE_CONFIG_TARGET_MISMATCH"
  }
  # Hosted Supabase owns realtime.messages. Three historical migrations try to
  # manage policies on that platform table and cannot run on a fresh hosted
  # project. Remove only those statements from this disposable copy so the
  # Sales Engine can still receive runtime validation; the repository files
  # remain unchanged and the workaround is surfaced in the final result.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $realtimeMigration1 = Join-Path $cliWorkdir "supabase\migrations\20260611202332_c509159e-8b84-41c7-9d04-dfeb1372b403.sql"
  [System.IO.File]::WriteAllText(
    $realtimeMigration1,
    "DROP POLICY IF EXISTS `"own ip blocks`" ON public.ip_blocks;`n-- Disposable hosted validation omits realtime.messages owner-only policy DDL.`n",
    $utf8NoBom
  )
  $realtimeMigration2 = Join-Path $cliWorkdir "supabase\migrations\20260611213708_6c4dc655-245f-4e9f-981d-6e5f349858f7.sql"
  $realtimeMigration2Text = Get-Content -Raw $realtimeMigration2
  $realtimeMigration2Text = $realtimeMigration2Text.Substring(
    0,
    $realtimeMigration2Text.IndexOf("-- 2. Realtime:")
  ) + "-- Disposable hosted validation omits realtime.messages owner-only policy DDL.`n"
  [System.IO.File]::WriteAllText($realtimeMigration2, $realtimeMigration2Text, $utf8NoBom)
  $realtimeMigration3 = Join-Path $cliWorkdir "supabase\migrations\20260611220706_c713f704-4659-4323-8197-5a488c12a3b0.sql"
  [System.IO.File]::WriteAllText(
    $realtimeMigration3,
    "-- Disposable hosted validation omits realtime.messages owner-only policy DDL.`n",
    $utf8NoBom
  )
  $results.baseline_workaround = "APPLIED"
  $link = Invoke-Captured "project_link_seconds" {
    Push-Location $cliWorkdir
    try {
      supabase link `
        --project-ref $projectRef `
        --password $databasePassword
    } finally {
      Pop-Location
    }
  }
  if ($link.ExitCode -ne 0) { throw "DISPOSABLE_PROJECT_LINK_FAILED`n$($link.Output)" }
  $linkedProjectPath = Join-Path $cliWorkdir "supabase\.temp\linked-project.json"
  if (-not (Test-Path $linkedProjectPath)) { throw "DISPOSABLE_LINK_METADATA_MISSING" }
  $linkedProject = Get-Content -Raw $linkedProjectPath | ConvertFrom-Json
  if ([string]$linkedProject.ref -ne $projectRef) {
    throw "DISPOSABLE_LINK_TARGET_MISMATCH"
  }
  Write-Output "DISPOSABLE_DATABASE_CONNECTED=true"

  $pushWatch = [System.Diagnostics.Stopwatch]::StartNew()
  $push = $null
  for ($pushAttempt = 1; $pushAttempt -le 30; $pushAttempt++) {
    $push = Invoke-Captured "migration_push_attempt_$pushAttempt" {
      Push-Location $cliWorkdir
      try {
        supabase db push `
          --linked `
          --include-all `
          --password $databasePassword `
          --yes
      } finally {
        Pop-Location
      }
    }
    if ($push.ExitCode -eq 0) { break }
    if ($push.Output -notmatch "tenant/user.*not found|ENOTFOUND") { break }
    Start-Sleep -Seconds 10
  }
  $pushWatch.Stop()
  $timings.migration_push_seconds = [math]::Round($pushWatch.Elapsed.TotalSeconds, 2)
  if ($push.ExitCode -ne 0) {
    $results.migration = "FAILED"
    throw "MIGRATION_PUSH_FAILED`n$($push.Output)"
  }
  $results.migration = "PASSED"
  Write-Output "MIGRATION_RESULT=PASSED"

  $env:SUPABASE_PROJECT_ID = $projectRef
  $types = Invoke-Captured "type_generation_seconds" { pnpm supabase:types }
  if ($types.ExitCode -ne 0) {
    $results.types = "FAILED"
    throw "TYPE_GENERATION_FAILED`n$($types.Output)"
  }
  $results.types = "PASSED"
  Write-Output "TYPE_GENERATION_RESULT=PASSED"

  $unit = Invoke-Captured "unit_test_seconds" { pnpm test:unit }
  if ($unit.ExitCode -ne 0) {
    $results.unit_tests = "FAILED"
    throw "UNIT_TESTS_FAILED`n$($unit.Output)"
  }
  $results.unit_tests = "PASSED"
  Write-Output "UNIT_TEST_RESULT=PASSED"

  $build = Invoke-Captured "build_seconds" { pnpm build }
  if ($build.ExitCode -ne 0) {
    $results.build = "FAILED"
    throw "BUILD_FAILED`n$($build.Output)"
  }
  $results.build = "PASSED"
  Write-Output "BUILD_RESULT=PASSED"

  $env:SUPABASE_URL = "https://${projectRef}.supabase.co"
  $env:SUPABASE_PUBLISHABLE_KEY = $publishableKey
  $env:SUPABASE_SERVICE_ROLE_KEY = $serviceKey
  $env:DISPOSABLE_SUPABASE_PROJECT_REF = $projectRef
  $env:SALES_ENGINE_DISPOSABLE_CONFIRM = "I_UNDERSTAND_THIS_PROJECT_WILL_BE_DISCARDED"
  $env:APP_BASE_URL = "http://127.0.0.1:3000"
  Stop-WorkspaceViteListener -RejectForeignListener
  $stdoutPath = Join-Path $env:TEMP "sales-engine-app-$projectRef.out.log"
  $stderrPath = Join-Path $env:TEMP "sales-engine-app-$projectRef.err.log"
  $pnpmPath = (Get-Command pnpm.cmd).Source
  $appProcess = Start-Process `
    -FilePath $pnpmPath `
    -ArgumentList @("dev", "--host", "127.0.0.1", "--port", "3000") `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath

  $appReady = $false
  $appWatch = [System.Diagnostics.Stopwatch]::StartNew()
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
      $tcp = New-Object System.Net.Sockets.TcpClient
      $connect = $tcp.ConnectAsync("127.0.0.1", 3000)
      if ($connect.Wait(1000) -and $tcp.Connected) {
        $appReady = $true
        $tcp.Dispose()
        break
      }
      $tcp.Dispose()
    } catch {}
    if ($appProcess.HasExited) { break }
    Start-Sleep -Seconds 2
  }
  $appWatch.Stop()
  $timings.app_start_seconds = [math]::Round($appWatch.Elapsed.TotalSeconds, 2)
  if (-not $appReady) {
    $appError = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { "no stderr log" }
    throw "APPLICATION_DID_NOT_START`n$appError"
  }
  Write-Output "DISPOSABLE_APPLICATION_READY=true"

  $runtime = Invoke-Captured "runtime_validation_seconds" {
    pnpm validate:sales-engine:disposable
  }
  if ($runtime.ExitCode -ne 0) {
    $results.runtime_validation = "FAILED"
    throw "RUNTIME_VALIDATION_FAILED`n$($runtime.Output)"
  }
  $results.runtime_validation = "PASSED"
  $results.runtime_output = $runtime.Output.Trim()
  Write-Output "RUNTIME_VALIDATION_RESULT=PASSED"
  Write-Output $runtime.Output
} catch {
  $results.failure = $_.Exception.Message.Replace($databasePassword, "[redacted]")
  Write-Output "VALIDATION_ERROR_BEGIN"
  Write-Output $results.failure
  Write-Output "VALIDATION_ERROR_END"
} finally {
  if ($appProcess -and -not $appProcess.HasExited) {
    Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Stop-WorkspaceViteListener
  if ($cliWorkdir) {
    $resolvedTemp = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd("\") + "\"
    $resolvedCliWorkdir = [System.IO.Path]::GetFullPath($cliWorkdir)
    if ($resolvedCliWorkdir.StartsWith($resolvedTemp) -and (Test-Path $resolvedCliWorkdir)) {
      Remove-Item -LiteralPath $resolvedCliWorkdir -Recurse -Force
    }
  }
  if ($projectRef) {
    $deleteWatch = [System.Diagnostics.Stopwatch]::StartNew()
    $delete = $null
    for ($deleteAttempt = 1; $deleteAttempt -le 40; $deleteAttempt++) {
      $delete = Invoke-Captured "project_delete_attempt_$deleteAttempt" {
        supabase projects delete $projectRef --yes
      }
      if ($delete.ExitCode -eq 0) { break }
      if ($delete.Output -notmatch "not ready for deletion") { break }
      Start-Sleep -Seconds 30
    }
    $deleteWatch.Stop()
    $timings.project_delete_seconds = [math]::Round($deleteWatch.Elapsed.TotalSeconds, 2)
    if ($delete.ExitCode -eq 0) {
      $results.cleanup = "PASSED"
      Write-Output "DISPOSABLE_PROJECT_DELETED=true"
    } else {
      $results.cleanup = "FAILED"
      Write-Output "DISPOSABLE_PROJECT_DELETE_ERROR=$($delete.Output)"
    }
  }
  Write-Output "VALIDATION_RESULTS_BEGIN"
  $results | ConvertTo-Json -Compress
  $timings | ConvertTo-Json -Compress
  Write-Output "VALIDATION_RESULTS_END"
  $resultFile = Join-Path $env:TEMP "sales-engine-validation-last.json"
  $resultDocument = [ordered]@{ results = $results; timings = $timings }
  [System.IO.File]::WriteAllText(
    $resultFile,
    ($resultDocument | ConvertTo-Json -Depth 6),
    (New-Object System.Text.UTF8Encoding($false))
  )
  Write-Output "VALIDATION_RESULT_FILE=$resultFile"
}
