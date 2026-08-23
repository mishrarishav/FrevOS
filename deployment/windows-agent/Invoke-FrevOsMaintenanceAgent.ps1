[CmdletBinding()]
param(
    [switch]$Once,
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$controlPlaneBase = "https://tserver2.eeslindia.org/frevos"
$workspaceRoot = "D:\FREVOS"
$environmentFile = "D:\TrackGRN\server.env"
$expectedRemote = "https://github.com/mishrarishav/FrevOS.git"
$repositorySlug = "mishrarishav/FrevOS"
$providerRepositoryId = "1329122983"
$agentId = "svc_frevos_windows_agent"
$agentWorkspaceId = "ws_uat_demo"
$agentLogRoot = "D:\FrevOS-Agent\logs"
$artifactRoot = "D:\FrevOS-Agent\frevos-artifacts"
$pollSeconds = 5
$gitExecutable = "C:\Program Files\Git\cmd\git.exe"
$githubCliExecutable = "C:\Program Files\GitHub CLI\gh.exe"
$pnpmExecutable = Join-Path $env:APPDATA "npm\pnpm.cmd"

function Read-EnvironmentFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "agent-configuration-missing"
    }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) { continue }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) { continue }
        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and ((
            $value.StartsWith('"') -and $value.EndsWith('"')) -or (
            $value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }
    return $values
}

function Assert-Tooling {
    foreach ($path in @($gitExecutable, $githubCliExecutable, $pnpmExecutable)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "agent-tooling-missing" }
    }
}

function Assert-Workspace {
    $resolved = (Resolve-Path -LiteralPath $workspaceRoot).Path.TrimEnd("\")
    if ($resolved -ine $workspaceRoot -or -not (Test-Path -LiteralPath (Join-Path $workspaceRoot ".git"))) {
        throw "repository-boundary-failed"
    }
    $remote = (& $gitExecutable -C $workspaceRoot remote get-url origin 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $remote -ine $expectedRemote) { throw "repository-boundary-failed" }
}

function Assert-GitHubOperator {
    $login = @(& $githubCliExecutable api user --jq .login 2>$null)
    if ($LASTEXITCODE -ne 0 -or ([string]($login | Select-Object -First 1)).Trim() -cne "mishrarishav") {
        throw "github-account-unavailable"
    }
    $repositoryId = @(& $githubCliExecutable api "repos/$repositorySlug" --jq .id 2>$null)
    if ($LASTEXITCODE -ne 0 -or ([string]($repositoryId | Select-Object -First 1)).Trim() -cne $providerRepositoryId) {
        throw "repository-boundary-failed"
    }
}

function Invoke-Git([string[]]$Arguments) {
    $output = @(& $gitExecutable -C $workspaceRoot @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "git-operation-failed" }
    return @($output | ForEach-Object { [string]$_ })
}

function Invoke-GitHubJson([string[]]$Arguments) {
    $output = @(& $githubCliExecutable @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "github-operation-failed" }
    try { return (($output -join "`n") | ConvertFrom-Json) }
    catch { throw "github-response-invalid" }
}

function Get-RepositoryFiles {
    $files = @(Invoke-Git @("ls-files", "--modified", "--deleted", "--others", "--exclude-standard") |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
    if ($files.Count -gt 5000) { throw "change-set-too-large" }
    return $files
}

function Get-ChangeDigest {
    $headSha = (Invoke-Git @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
    $entries = New-Object System.Collections.Generic.List[string]
    $entries.Add("HEAD $headSha")
    foreach ($relativePath in Get-RepositoryFiles) {
        if ($relativePath.Contains("..") -or [IO.Path]::IsPathRooted($relativePath)) {
            throw "repository-path-invalid"
        }
        $absolutePath = Join-Path $workspaceRoot $relativePath
        if (Test-Path -LiteralPath $absolutePath -PathType Leaf) {
            $digest = (Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash.ToLowerInvariant()
            $entries.Add("FILE $relativePath $digest")
        } elseif (-not (Test-Path -LiteralPath $absolutePath -PathType Container)) {
            $entries.Add("DELETE $relativePath")
        }
    }
    $payload = [Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($payload))).Replace("-", "").ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Get-OpenPullRequest([string]$Branch, [string]$HeadSha) {
    if ($Branch -ceq "main") { return $null }
    Assert-GitHubOperator
    $pullRequests = @(Invoke-GitHubJson @(
        "pr", "list", "--repo", $repositorySlug, "--head", $Branch, "--state", "open",
        "--json", "number,url,state,isDraft,baseRefName,headRefOid"
    ))
    if ($pullRequests.Count -gt 1) { throw "pull-request-state-invalid" }
    if ($pullRequests.Count -eq 0) { return $null }
    $pullRequest = $pullRequests[0]
    if ([string]$pullRequest.state -cne "OPEN" -or [bool]$pullRequest.isDraft -or
        [string]$pullRequest.baseRefName -cne "main" -or [string]$pullRequest.headRefOid -cne $HeadSha) {
        throw "pull-request-state-invalid"
    }
    return [ordered]@{
        pullRequestNumber = [int]$pullRequest.number
        pullRequestUrl = [string]$pullRequest.url
        pullRequestHeadSha = $HeadSha
    }
}

function Get-RepositorySnapshot([bool]$IncludePullRequest = $false) {
    Assert-Workspace
    $headSha = (Invoke-Git @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
    $branch = (Invoke-Git @("branch", "--show-current") | Select-Object -First 1).Trim()
    $files = @(Get-RepositoryFiles)
    $result = [ordered]@{
        repository = $repositorySlug
        providerRepositoryId = $providerRepositoryId
        headSha = $headSha
        branch = $branch
        clean = ($files.Count -eq 0)
        changedFiles = @($files | Select-Object -First 200)
        changedFileCount = $files.Count
        changeDigest = Get-ChangeDigest
    }
    if ($IncludePullRequest) {
        $pullRequest = Get-OpenPullRequest $branch $headSha
        if ($null -ne $pullRequest) {
            $result["pullRequestNumber"] = $pullRequest.pullRequestNumber
            $result["pullRequestUrl"] = $pullRequest.pullRequestUrl
            $result["pullRequestHeadSha"] = $pullRequest.pullRequestHeadSha
        }
    }
    return $result
}

function Get-CommitProposal {
    $snapshot = Get-RepositorySnapshot $true
    $areas = New-Object System.Collections.Generic.List[string]
    $files = @($snapshot.changedFiles)
    if (@($files | Where-Object { $_ -like "apps/*" }).Count -gt 0) { $areas.Add("applications") }
    if (@($files | Where-Object { $_ -like "packages/*" }).Count -gt 0) { $areas.Add("contracts") }
    if (@($files | Where-Object { $_ -like "deployment/*" }).Count -gt 0) { $areas.Add("deployment") }
    if (@($files | Where-Object { $_ -like "docs/*" }).Count -gt 0) { $areas.Add("documentation") }
    if ($areas.Count -eq 0) { $areas.Add("workspace") }
    return [ordered]@{
        repository = $snapshot.repository
        headSha = $snapshot.headSha
        branch = $snapshot.branch
        clean = $snapshot.clean
        changedFiles = $snapshot.changedFiles
        changedFileCount = $snapshot.changedFileCount
        changeDigest = $snapshot.changeDigest
        proposedCommitMessage = "Update FrevOS " + ($areas -join " and ")
        proposalSource = "deterministic-file-summary"
    }
}

function Commit-AndPush([object]$Operation) {
    Assert-GitHubOperator
    $snapshot = Get-RepositorySnapshot
    if ($snapshot.clean -or $snapshot.branch -cne "main") { throw "reviewed-changes-unavailable" }
    $remoteMain = @(Invoke-Git @("ls-remote", "--heads", "origin", "refs/heads/main"))
    if ($remoteMain.Count -ne 1 -or -not ([string]$remoteMain[0]).StartsWith("$($snapshot.headSha)`t")) {
        throw "default-branch-outdated"
    }
    if ($snapshot.headSha -cne [string]$Operation.input.expectedHeadSha -or
        $snapshot.changeDigest -cne [string]$Operation.input.expectedChangeDigest) {
        throw "review-evidence-changed"
    }
    $message = [string]$Operation.input.commitMessage
    if ($message.Length -lt 3 -or $message.Length -gt 120 -or $message -match "[`r`n]") {
        throw "commit-message-invalid"
    }
    $suffix = ([string]$Operation.operationId).Substring(3, 12)
    $branch = "frevos/frevos-$suffix"
    Invoke-Git @("switch", "-c", $branch) | Out-Null
    Invoke-Git @("add", "--all") | Out-Null
    Invoke-Git @("commit", "-m", $message) | Out-Null
    Invoke-Git @("push", "--set-upstream", "origin", "HEAD") | Out-Null
    $newHead = (Invoke-Git @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
    return [ordered]@{
        sourceSha = $snapshot.headSha
        commitSha = $newHead
        branch = $branch
        commitMessage = $message
        repositoryUrl = "https://github.com/$repositorySlug"
    }
}

function Open-PullRequest([object]$Operation) {
    Assert-GitHubOperator
    $snapshot = Get-RepositorySnapshot
    $expectedHead = [string]$Operation.input.expectedHeadSha
    $branch = [string]$Operation.input.branch
    $title = [string]$Operation.input.title
    if (-not $snapshot.clean -or $snapshot.headSha -cne $expectedHead -or
        $snapshot.branch -cne $branch -or $branch -cnotmatch "^frevos/frevos-[A-Za-z0-9_-]{12}$") {
        throw "reviewed-branch-invalid"
    }
    $pullRequests = @(Invoke-GitHubJson @("pr", "list", "--repo", $repositorySlug, "--head", $branch,
        "--state", "open", "--json", "number,url,state,isDraft,baseRefName,headRefOid"))
    if ($pullRequests.Count -gt 1) { throw "pull-request-state-invalid" }
    if ($pullRequests.Count -eq 0) {
        $created = @(& $githubCliExecutable @(
            "pr", "create", "--repo", $repositorySlug, "--base", "main", "--head", $branch,
            "--title", $title, "--body",
            "Created from reviewed FrevOS evidence. Auto-merge still requires an explicit administrator action."
        ) 2>$null)
        if ($LASTEXITCODE -ne 0 -or $created.Count -eq 0) { throw "pull-request-create-failed" }
        $pullRequest = Invoke-GitHubJson @("pr", "view", ([string]$created[-1]).Trim(), "--repo", $repositorySlug,
            "--json", "number,url,state,isDraft,baseRefName,headRefOid")
    } else { $pullRequest = $pullRequests[0] }
    if ([string]$pullRequest.state -cne "OPEN" -or [bool]$pullRequest.isDraft -or
        [string]$pullRequest.baseRefName -cne "main" -or [string]$pullRequest.headRefOid -cne $expectedHead) {
        throw "pull-request-state-invalid"
    }
    return [ordered]@{
        pullRequestNumber = [int]$pullRequest.number
        pullRequestUrl = [string]$pullRequest.url
        state = "OPEN"
        baseBranch = "main"
        branch = $branch
        headSha = $expectedHead
        autoMergeRequiresAdminConfirmation = $true
    }
}

function Enable-AutoMerge([object]$Operation) {
    Assert-GitHubOperator
    $number = [int]$Operation.input.pullRequestNumber
    $expectedHead = [string]$Operation.input.expectedHeadSha
    $approvalExpiresAt = [DateTimeOffset]::MinValue
    if ([string]$Operation.input.confirmation -cne "enable-auto-merge" -or
        -not [DateTimeOffset]::TryParse([string]$Operation.input.approvalExpiresAt, [ref]$approvalExpiresAt) -or
        $approvalExpiresAt -le [DateTimeOffset]::UtcNow) {
        throw "merge-approval-expired"
    }
    $pullRequest = Invoke-GitHubJson @("pr", "view", "$number", "--repo", $repositorySlug,
        "--json", "number,url,state,isDraft,baseRefName,headRefOid,mergeable")
    if ([string]$pullRequest.state -cne "OPEN" -or [bool]$pullRequest.isDraft -or
        [string]$pullRequest.baseRefName -cne "main" -or [string]$pullRequest.headRefOid -cne $expectedHead -or
        [string]$pullRequest.mergeable -cne "MERGEABLE") {
        throw "pull-request-not-mergeable"
    }
    & $githubCliExecutable pr merge "$number" --repo $repositorySlug --auto --squash --delete-branch `
        --match-head-commit $expectedHead *> $null
    if ($LASTEXITCODE -ne 0) { throw "auto-merge-enable-failed" }
    $updated = Invoke-GitHubJson @("pr", "view", "$number", "--repo", $repositorySlug,
        "--json", "number,url,state,headRefOid,autoMergeRequest,mergeCommit")
    $state = [string]$updated.state
    if ($state -notin @("OPEN", "MERGED") -or [string]$updated.headRefOid -cne $expectedHead) {
        throw "auto-merge-verification-failed"
    }
    return [ordered]@{
        pullRequestNumber = $number
        pullRequestUrl = [string]$updated.url
        reviewedHeadSha = $expectedHead
        state = $state
        autoMergeEnabled = ($state -eq "OPEN")
        merged = ($state -eq "MERGED")
        mergeCommitSha = if ($null -eq $updated.mergeCommit) { $null } else { [string]$updated.mergeCommit.oid }
        approvalSource = "authenticated-frevos-admin"
    }
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$FailureCode, [string]$OperationId) {
    Push-Location $workspaceRoot
    try {
        $previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $output = @(& $FilePath @Arguments 2>&1)
            $exitCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previous }
        if ($exitCode -ne 0) {
            New-Item -ItemType Directory -Path $agentLogRoot -Force | Out-Null
            @($output | Select-Object -Last 200) | Set-Content -LiteralPath (Join-Path $agentLogRoot "$OperationId-$FailureCode.log") -Encoding UTF8
            throw $FailureCode
        }
        return $output
    } finally { Pop-Location }
}

function Assert-RequiredValidation([string]$SourceSha) {
    Assert-GitHubOperator
    $checks = Invoke-GitHubJson @("api", "repos/$repositorySlug/commits/$SourceSha/check-runs?per_page=100")
    $validate = @($checks.check_runs | Where-Object { [string]$_.name -ceq "validate" })
    if ($validate.Count -ne 1 -or [string]$validate[0].status -cne "completed" -or
        [string]$validate[0].conclusion -cne "success") {
        throw "required-check-missing"
    }
}

function Build-FrevOsRelease([string]$OperationId, [bool]$RunLocalValidation) {
    $snapshot = Get-RepositorySnapshot
    if (-not $snapshot.clean) { throw "source-not-clean" }
    $outputDirectory = Join-Path $artifactRoot $OperationId
    if (Test-Path -LiteralPath $outputDirectory) { throw "artifact-already-exists" }
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    if ($RunLocalValidation) {
        Invoke-Checked $pnpmExecutable @("run", "ci") "validation-failed" $OperationId | Out-Null
        $validation = "local-ci-passed"
    } else {
        Assert-RequiredValidation $snapshot.headSha
        $validation = "github-validate-passed"
    }
    Invoke-Checked "powershell.exe" @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
        (Join-Path $workspaceRoot "deployment\windows-uat\New-WindowsUatRelease.ps1"),
        "-OutputDirectory", $outputDirectory
    ) "release-build-failed" $OperationId | Out-Null
    $archive = Join-Path $outputDirectory "frevos-windows-uat-$($snapshot.headSha).zip"
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "release-build-failed" }
    return [ordered]@{
        sourceSha = $snapshot.headSha
        sourceBranch = $snapshot.branch
        archivePath = $archive
        archiveSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        archiveBytes = (Get-Item -LiteralPath $archive).Length
        validation = $validation
        packageBuild = "passed"
    }
}

function Sync-DefaultBranch {
    $snapshot = Get-RepositorySnapshot
    if (-not $snapshot.clean) { throw "source-not-clean" }
    Invoke-Git @("fetch", "origin", "main") | Out-Null
    if ($snapshot.branch -cne "main") { Invoke-Git @("switch", "main") | Out-Null }
    Invoke-Git @("merge", "--ff-only", "origin/main") | Out-Null
    $updated = Get-RepositorySnapshot
    if (-not $updated.clean -or $updated.branch -cne "main") { throw "default-branch-sync-failed" }
    return $updated
}

function Release-FrevOs([object]$Operation, [hashtable]$Environment) {
    $snapshot = Sync-DefaultBranch
    $build = Build-FrevOsRelease ([string]$Operation.operationId) $false
    foreach ($key in @("EESL_WINRM_HOST", "EESL_WINRM_USERNAME", "EESL_WINRM_PASSWORD")) {
        if ([string]::IsNullOrWhiteSpace([string]$Environment[$key])) { throw "agent-configuration-missing" }
    }
    $hostName = [string]$Environment["EESL_WINRM_HOST"]
    $probe = Test-NetConnection -ComputerName $hostName -Port 445 -WarningAction SilentlyContinue
    if (-not $probe.TcpTestSucceeded) { throw "vpn-required" }
    $securePassword = ConvertTo-SecureString ([string]$Environment["EESL_WINRM_PASSWORD"]) -AsPlainText -Force
    $credential = New-Object Management.Automation.PSCredential([string]$Environment["EESL_WINRM_USERNAME"], $securePassword)
    $driveName = "FV" + ([string]$Operation.operationId).Substring(3, 6)
    $drive = $null
    try {
        $drive = New-PSDrive -Name $driveName -PSProvider FileSystem -Root "\\$hostName\d$" -Credential $credential
        $automationRoot = "$driveName`:\FrevOS-UAT\automation"
        $inbox = Join-Path $automationRoot "inbox"
        $outbox = Join-Path $automationRoot "outbox"
        New-Item -ItemType Directory -Path $inbox,$outbox -Force | Out-Null
        $archiveName = "frevos-windows-uat-$($snapshot.headSha).zip"
        $remoteArchive = Join-Path $inbox $archiveName
        $partialArchive = "$remoteArchive.partial"
        Copy-Item -LiteralPath $build.archivePath -Destination $partialArchive -Force
        Move-Item -LiteralPath $partialArchive -Destination $remoteArchive -Force
        $request = [ordered]@{
            schemaVersion = 1
            operationId = [string]$Operation.operationId
            sourceSha = $snapshot.headSha
            archiveFile = $archiveName
            archiveSha256 = $build.archiveSha256
            requestedAt = [DateTime]::UtcNow.ToString("o")
        }
        $requestPath = Join-Path $env:TEMP "$($Operation.operationId)-frevos-release.json"
        [IO.File]::WriteAllText($requestPath, ($request | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
        try {
            $remoteRequest = Join-Path $inbox "$($Operation.operationId).json"
            Copy-Item -LiteralPath $requestPath -Destination "$remoteRequest.partial" -Force
            Move-Item -LiteralPath "$remoteRequest.partial" -Destination $remoteRequest -Force
        } finally { Remove-Item -LiteralPath $requestPath -Force -ErrorAction SilentlyContinue }

        $responsePath = Join-Path $outbox "$($Operation.operationId).json"
        $deadline = [DateTime]::UtcNow.AddMinutes(45)
        while (-not (Test-Path -LiteralPath $responsePath -PathType Leaf)) {
            if ([DateTime]::UtcNow -ge $deadline) { throw "server-deploy-timeout" }
            Start-Sleep -Seconds 5
        }
        $response = Get-Content -LiteralPath $responsePath -Raw | ConvertFrom-Json
        if ([string]$response.status -cne "succeeded" -or [string]$response.sourceSha -cne $snapshot.headSha) {
            throw "server-deploy-failed"
        }
        $healthUri = "https://tserver2.eeslindia.org/frevos/health"
        $health = Invoke-WebRequest -UseBasicParsing -Uri $healthUri -TimeoutSec 30
        if ([int]$health.StatusCode -ne 200) { throw "health-check-failed" }
        return [ordered]@{
            sourceSha = $snapshot.headSha
            archiveSha256 = $build.archiveSha256
            archiveBytes = $build.archiveBytes
            serverReleasePath = [string]$response.releasePath
            serverDeployment = "passed"
            healthUri = $healthUri
            healthStatus = [int]$health.StatusCode
        }
    } finally {
        if ($null -ne $drive) { Remove-PSDrive -Name $driveName -Force -ErrorAction SilentlyContinue }
        $credential = $null
        $securePassword = $null
    }
}

function Invoke-AgentRequest([string]$Method, [string]$Path, [string]$Token, [object]$Body = $null) {
    $parameters = @{
        Method = $Method
        Uri = "$controlPlaneBase$Path"
        Headers = @{ Authorization = "Bearer $Token"; "X-FrevOS-Agent-Id" = $agentId; "X-FrevOS-Workspace-Id" = $agentWorkspaceId }
        UseBasicParsing = $true
        TimeoutSec = 30
    }
    if ($null -ne $Body) {
        $parameters["ContentType"] = "application/json"
        $parameters["Body"] = $Body | ConvertTo-Json -Depth 12 -Compress
    }
    return Invoke-WebRequest @parameters
}

function Invoke-Operation([object]$Operation, [hashtable]$Environment) {
    switch ([string]$Operation.action) {
        "repository.inspect" { return Get-RepositorySnapshot $true }
        "repository.propose-commit" { return Get-CommitProposal }
        "repository.commit-push" { return Commit-AndPush $Operation }
        "repository.open-pull-request" { return Open-PullRequest $Operation }
        "repository.enable-auto-merge" { return Enable-AutoMerge $Operation }
        "project.build" { return Build-FrevOsRelease ([string]$Operation.operationId) $true }
        "uat.release" { return Release-FrevOs $Operation $Environment }
        default { throw "operation-not-allowlisted" }
    }
}

Assert-Tooling
Assert-Workspace
if ($SelfTest) {
    Assert-GitHubOperator
    Get-RepositorySnapshot $true | ConvertTo-Json -Depth 6
    exit 0
}
$environment = Read-EnvironmentFile $environmentFile
$agentToken = [string]$environment["FREVOS_TRACKGRN_AGENT_TOKEN"]
if ([string]::IsNullOrWhiteSpace($agentToken) -or $agentToken.Length -lt 32) { throw "agent-token-invalid" }

do {
    try {
        $claim = Invoke-AgentRequest "POST" "/v1/agents/frevos/claim" $agentToken ([ordered]@{})
        if ([int]$claim.StatusCode -eq 204 -or [string]::IsNullOrWhiteSpace($claim.Content)) {
            if (-not $Once) { Start-Sleep -Seconds $pollSeconds }
            continue
        }
        $operation = $claim.Content | ConvertFrom-Json
        try {
            $result = Invoke-Operation $operation $environment
            $completion = [ordered]@{ status = "succeeded"; result = $result }
        } catch {
            $known = @("vpn-required", "validation-failed", "required-check-missing", "release-build-failed", "artifact-already-exists",
                "source-not-clean", "server-deploy-timeout", "server-deploy-failed", "health-check-failed",
                "auto-merge-enable-failed", "pull-request-not-mergeable", "merge-approval-expired")
            $failure = [string]$_.Exception.Message
            $errorCode = if ($known -ccontains $failure) { $failure } else { "operation-failed" }
            $completion = [ordered]@{
                status = "failed"
                errorCode = $errorCode
                result = [ordered]@{ message = "The allowlisted FrevOS maintenance operation failed."; failureStage = $errorCode }
            }
        }
        Invoke-AgentRequest "POST" "/v1/agents/frevos/operations/$($operation.operationId)/complete" $agentToken $completion | Out-Null
    } catch {
        if ($Once) { throw }
        Start-Sleep -Seconds $pollSeconds
    }
} while (-not $Once)
