[CmdletBinding()]
param(
    [switch]$Once,
    [switch]$SelfTest,
    [switch]$DiscoverySelfTest
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$controlPlaneBase = "https://tserver2.eeslindia.org/frevos"
$workspaceRoot = "D:\TrackGRN"
$environmentFile = "D:\TrackGRN\server.env"
$expectedRemote = "https://github.com/mishrarishav/TraceGRN.git"
$agentId = "svc_trackgrn_windows_agent"
$agentWorkspaceId = "ws_uat_demo"
$serverReleaseRoot = "D:\TrackGRN-UAT\releases"
$iisScriptRelativePath = "APItrackGRN\scripts\configure-iis-production.ps1"
$apiProjectRelativePath = "APItrackGRN\src\APItrackGRN.Api\APItrackGRN.Api.csproj"
$solutionRelativePath = "APItrackGRN\APItrackGRN.sln"
$pollSeconds = 5
$agentLogRoot = "D:\FrevOS-Agent\logs"
$gitExecutable = "C:\Program Files\Git\cmd\git.exe"
$githubCliExecutable = "C:\Program Files\GitHub CLI\gh.exe"
$npmExecutable = "C:\Program Files\nodejs\npm.cmd"
$dotnetExecutable = "C:\Program Files\dotnet\dotnet.exe"

function Assert-AgentTooling {
    foreach ($path in @($gitExecutable, $githubCliExecutable, $npmExecutable, $dotnetExecutable)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "An approved TrackGRN agent tool is unavailable."
        }
    }
}

function Read-EnvironmentFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "The TrackGRN agent environment file is missing."
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            continue
        }
        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }
    return $values
}

function Assert-Workspace {
    $resolved = (Resolve-Path -LiteralPath $workspaceRoot).Path.TrimEnd("\")
    if ($resolved -ine $workspaceRoot) {
        throw "The allowlisted TrackGRN workspace was not found at its exact path."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot ".git"))) {
        throw "The allowlisted TrackGRN workspace is not a Git checkout."
    }
    $remote = (& $gitExecutable -C $workspaceRoot remote get-url origin 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $remote -ine $expectedRemote) {
        throw "The TrackGRN origin does not match the approved GitHub repository."
    }
}

function Invoke-Git([string[]]$Arguments) {
    $output = @(& $gitExecutable -C $workspaceRoot @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "An allowlisted Git operation failed."
    }
    return @($output | ForEach-Object { [string]$_ })
}

function Assert-GitHubOperator {
    $login = @(& $githubCliExecutable api user --jq .login 2>$null)
    if ($LASTEXITCODE -ne 0 -or ([string]($login | Select-Object -First 1)).Trim() -cne "mishrarishav") {
        throw "The approved GitHub operator credential is unavailable."
    }
    $repositoryId = @(& $githubCliExecutable api repos/mishrarishav/TraceGRN --jq .id 2>$null)
    if ($LASTEXITCODE -ne 0 -or ([string]($repositoryId | Select-Object -First 1)).Trim() -cne "1334902237") {
        throw "The GitHub provider repository identity could not be verified."
    }
}

function Invoke-GitHubJson([string[]]$Arguments) {
    $output = @(& $githubCliExecutable @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) {
        throw "An allowlisted GitHub operation failed."
    }
    try {
        return (($output -join "`n") | ConvertFrom-Json)
    }
    catch {
        throw "GitHub returned an invalid response."
    }
}

function Get-GitHubDiscovery {
    $account = Invoke-GitHubJson @("api", "user")
    $rawRepositories = @(Invoke-GitHubJson @("api", "user/repos?per_page=50&sort=updated"))
    $login = ([string]$account.login).Trim()
    $providerAccountId = ([string]$account.id).Trim()
    if ($login -notmatch "^[A-Za-z0-9][A-Za-z0-9-]{0,38}$" -or
        $providerAccountId -notmatch "^\d{1,20}$") {
        throw "github-account-unavailable"
    }

    $repositories = @(
        foreach ($repository in $rawRepositories | Select-Object -First 50) {
            $owner = ([string]$repository.owner.login).Trim()
            $name = ([string]$repository.name).Trim()
            $providerRepositoryId = ([string]$repository.id).Trim()
            $defaultBranch = ([string]$repository.default_branch).Trim()
            if ($owner -notmatch "^[A-Za-z0-9][A-Za-z0-9-]{0,38}$" -or
                $name -notmatch "^[A-Za-z0-9._-]{1,100}$" -or
                $providerRepositoryId -notmatch "^\d{1,20}$" -or
                $defaultBranch -notmatch "^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$") {
                continue
            }
            $visibility = ([string]$repository.visibility).Trim().ToLowerInvariant()
            if ([string]::IsNullOrWhiteSpace($visibility)) {
                $visibility = if ([bool]$repository.private) { "private" } else { "public" }
            }
            if ($visibility -notin @("public", "private", "internal")) {
                throw "github-repository-catalog-invalid"
            }
            [ordered]@{
                providerRepositoryId = $providerRepositoryId
                owner = $owner
                name = $name
                url = "https://github.com/$owner/$name"
                defaultBranch = $defaultBranch
                visibility = $visibility
                archived = [bool]$repository.archived
            }
        }
    )

    return [ordered]@{
        provider = "github"
        account = [ordered]@{
            providerAccountId = $providerAccountId
            login = $login
        }
        repositories = $repositories
    }
}

function Get-RepositoryFiles {
    $files = @(
        Invoke-Git @("ls-files", "--modified", "--deleted", "--others", "--exclude-standard") |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Sort-Object -Unique
    )
    if ($files.Count -gt 5000) {
        throw "The change set exceeds the TrackGRN pilot file limit."
    }
    return $files
}

function Get-ChangeDigest {
    $headSha = (Invoke-Git @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
    $entries = New-Object System.Collections.Generic.List[string]
    $entries.Add("HEAD $headSha")
    foreach ($relativePath in Get-RepositoryFiles) {
        if ($relativePath.Contains("..") -or [IO.Path]::IsPathRooted($relativePath)) {
            throw "Git returned an unsafe repository path."
        }
        $absolutePath = Join-Path $workspaceRoot $relativePath
        if (Test-Path -LiteralPath $absolutePath -PathType Leaf) {
            $digest = (Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash.ToLowerInvariant()
            $entries.Add("FILE $relativePath $digest")
        }
        elseif (Test-Path -LiteralPath $absolutePath -PathType Container) {
            continue
        }
        else {
            $entries.Add("DELETE $relativePath")
        }
    }
    $payload = [Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($payload))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Get-RepositorySnapshot {
    Assert-Workspace
    $headSha = (Invoke-Git @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
    $branch = (Invoke-Git @("branch", "--show-current") | Select-Object -First 1).Trim()
    $files = @(Get-RepositoryFiles)
    return [ordered]@{
        repository = "mishrarishav/TraceGRN"
        providerRepositoryId = "1334902237"
        headSha = $headSha
        branch = $branch
        clean = ($files.Count -eq 0)
        changedFiles = @($files | Select-Object -First 200)
        changedFileCount = $files.Count
        changeDigest = Get-ChangeDigest
    }
}

function Get-CommitProposal {
    $snapshot = Get-RepositorySnapshot
    $files = @($snapshot.changedFiles)
    $areas = New-Object System.Collections.Generic.List[string]
    if (@($files | Where-Object { $_ -like "APItrackGRN/*" }).Count -gt 0) { $areas.Add("API") }
    if (@($files | Where-Object { $_ -like "UItrackGRN/*" }).Count -gt 0) { $areas.Add("UI") }
    if (@($files | Where-Object { $_ -like "docs/*" }).Count -gt 0) { $areas.Add("documentation") }
    if ($areas.Count -eq 0) { $areas.Add("workspace") }
    $proposal = "Update TrackGRN " + ($areas -join " and ")
    return [ordered]@{
        repository = $snapshot.repository
        headSha = $snapshot.headSha
        branch = $snapshot.branch
        clean = $snapshot.clean
        changedFiles = $snapshot.changedFiles
        changedFileCount = $snapshot.changedFileCount
        changeDigest = $snapshot.changeDigest
        proposedCommitMessage = $proposal
        proposalSource = "deterministic-file-summary"
    }
}

function Invoke-CheckedNative(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$FailureCode,
    [string]$OperationId
) {
    if ($OperationId -cnotmatch "^op_[a-f0-9]{48}$") {
        throw "invalid-operation-id"
    }
    Push-Location $workspaceRoot
    try {
        try {
            $previousErrorActionPreference = $ErrorActionPreference
            try {
                # Windows PowerShell 5.1 surfaces native stderr as ErrorRecord objects.
                # Tool warnings are not failures; the native exit code is authoritative.
                $ErrorActionPreference = "Continue"
                $output = @(& $FilePath @Arguments 2>&1)
                $exitCode = $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference = $previousErrorActionPreference
            }
            if ($exitCode -ne 0) {
                New-Item -ItemType Directory -Path $agentLogRoot -Force | Out-Null
                $logPath = Join-Path $agentLogRoot "$OperationId-$FailureCode.log"
                @($output | Select-Object -Last 200) | Set-Content -LiteralPath $logPath -Encoding UTF8
                throw $FailureCode
            }
        }
        catch {
            if ($_.Exception.Message -cne $FailureCode) {
                New-Item -ItemType Directory -Path $agentLogRoot -Force | Out-Null
                $logPath = Join-Path $agentLogRoot "$OperationId-$FailureCode.log"
                @([string]$_.Exception.Message) | Set-Content -LiteralPath $logPath -Encoding UTF8
            }
            throw $FailureCode
        }
    }
    finally {
        Pop-Location
    }
}

function Get-ArtifactDigest([string]$Path) {
    $manifest = New-Object System.Collections.Generic.List[string]
    $files = @(Get-ChildItem -LiteralPath $Path -File -Recurse | Sort-Object FullName)
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($Path.Length).TrimStart("\").Replace("\", "/")
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $manifest.Add("$relative $hash")
    }
    $payload = [Text.Encoding]::UTF8.GetBytes(($manifest -join "`n"))
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($payload))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Build-TrackGrn([string]$OperationId, [hashtable]$Environment) {
    $snapshot = Get-RepositorySnapshot
    Invoke-CheckedNative $npmExecutable @("run", "ui:build") "ui-build-failed" $OperationId
    # SqlEndToEndTests intentionally create and delete TrackGRN_IntegrationTests
    # on a developer-owned SQLEXPRESS instance. The UAT companion must never
    # redirect that destructive fixture to the live TrackGRN database.
    Invoke-CheckedNative $dotnetExecutable @(
        "test",
        $solutionRelativePath,
        "--configuration",
        "Release",
        "--filter",
        "FullyQualifiedName!~APItrackGRN.Tests.SqlEndToEndTests"
    ) "api-tests-failed" $OperationId

    $artifactRoot = Join-Path "D:\FrevOS-Agent\artifacts" $OperationId
    if (Test-Path -LiteralPath $artifactRoot) {
        throw "artifact-already-exists"
    }
    New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
    Invoke-CheckedNative $dotnetExecutable @(
        "publish",
        $apiProjectRelativePath,
        "--configuration",
        "Release",
        "--output",
        $artifactRoot
    ) "api-publish-failed" $OperationId
    return [ordered]@{
        sourceSha = $snapshot.headSha
        sourceBranch = $snapshot.branch
        artifactPath = $artifactRoot
        artifactSha256 = Get-ArtifactDigest $artifactRoot
        uiBuild = "passed"
        apiNonDestructiveTests = "passed"
        sqlEndToEndTests = "not-run-requires-isolated-sqlexpress"
        apiPublish = "passed"
    }
}

function Commit-AndPush([object]$Operation) {
    Assert-GitHubOperator
    $snapshot = Get-RepositorySnapshot
    if ($snapshot.clean) { throw "There are no reviewed TrackGRN changes to commit." }
    if ($snapshot.branch -cne "main") {
        throw "Reviewed TrackGRN changes must start from the local main branch."
    }
    $remoteMain = @(Invoke-Git @("ls-remote", "--heads", "origin", "refs/heads/main"))
    if ($remoteMain.Count -ne 1 -or
        -not ([string]$remoteMain[0]).StartsWith("$($snapshot.headSha)`t")) {
        throw "The local TrackGRN main branch is not the current remote main."
    }
    if ($snapshot.headSha -cne [string]$Operation.input.expectedHeadSha) {
        throw "The repository HEAD changed after review."
    }
    if ($snapshot.changeDigest -cne [string]$Operation.input.expectedChangeDigest) {
        throw "The TrackGRN change set changed after review."
    }
    $message = [string]$Operation.input.commitMessage
    if ($message.Length -lt 3 -or $message.Length -gt 120 -or $message.Contains("`n") -or $message.Contains("`r")) {
        throw "The reviewed commit message is invalid."
    }
    $suffix = ([string]$Operation.operationId).Substring(3, 12)
    $branch = "frevos/trackgrn-$suffix"
    if (@(Invoke-Git @("branch", "--list", $branch)).Count -ne 0) {
        throw "The dedicated TrackGRN branch already exists."
    }
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
        repositoryUrl = "https://github.com/mishrarishav/TraceGRN"
        pullRequestUrl = "https://github.com/mishrarishav/TraceGRN/compare/main...$branch?expand=1"
    }
}

function Open-PullRequest([object]$Operation) {
    Assert-GitHubOperator
    $snapshot = Get-RepositorySnapshot
    $expectedHead = [string]$Operation.input.expectedHeadSha
    $branch = [string]$Operation.input.branch
    $title = [string]$Operation.input.title
    if ($snapshot.clean -ne $true -or $snapshot.headSha -cne $expectedHead) {
        throw "The reviewed branch source changed before pull request creation."
    }
    if ($branch -cnotmatch "^frevos/trackgrn-[A-Za-z0-9_-]{12}$" -or
        $snapshot.branch -cne $branch) {
        throw "The reviewed TrackGRN branch is invalid."
    }
    if ($title.Length -lt 3 -or $title.Length -gt 120 -or
        $title.Contains("`n") -or $title.Contains("`r") -or $title.Trim() -cne $title) {
        throw "The reviewed pull request title is invalid."
    }
    $remoteHead = @(Invoke-Git @("ls-remote", "--heads", "origin", "refs/heads/$branch"))
    if ($remoteHead.Count -ne 1 -or -not ([string]$remoteHead[0]).StartsWith("$expectedHead`t")) {
        throw "The reviewed remote branch head could not be verified."
    }

    $pullRequests = @(
        Invoke-GitHubJson @(
            "pr", "list",
            "--repo", "mishrarishav/TraceGRN",
            "--head", $branch,
            "--state", "open",
            "--json", "number,url,state,isDraft,baseRefName,headRefOid"
        )
    )
    if ($pullRequests.Count -gt 1) {
        throw "Multiple open pull requests exist for the reviewed branch."
    }
    if ($pullRequests.Count -eq 0) {
        $createdUrl = @(& $githubCliExecutable pr create `
            --repo "mishrarishav/TraceGRN" `
            --base "main" `
            --head $branch `
            --title $title `
            --body "Created from a reviewed FrevOS TrackGRN operation. Human approval is required before squash merge." `
            2>$null)
        if ($LASTEXITCODE -ne 0 -or $createdUrl.Count -eq 0) {
            throw "The reviewed TrackGRN pull request could not be created."
        }
        $pullRequest = Invoke-GitHubJson @(
            "pr", "view", ([string]$createdUrl[-1]).Trim(),
            "--repo", "mishrarishav/TraceGRN",
            "--json", "number,url,state,isDraft,baseRefName,headRefOid"
        )
    }
    else {
        $pullRequest = $pullRequests[0]
    }
    if ([string]$pullRequest.state -cne "OPEN" -or [bool]$pullRequest.isDraft -or
        [string]$pullRequest.baseRefName -cne "main" -or
        [string]$pullRequest.headRefOid -cne $expectedHead) {
        throw "The TrackGRN pull request does not match the reviewed branch."
    }
    return [ordered]@{
        pullRequestNumber = [int]$pullRequest.number
        pullRequestUrl = [string]$pullRequest.url
        state = "OPEN"
        baseBranch = "main"
        branch = $branch
        headSha = $expectedHead
        humanMergeRequired = $true
    }
}

function Squash-MergePullRequest([object]$Operation) {
    Assert-GitHubOperator
    $snapshot = Get-RepositorySnapshot
    if (-not $snapshot.clean) {
        throw "TrackGRN squash merge requires a clean checkout."
    }
    $number = [int]$Operation.input.pullRequestNumber
    $expectedHead = [string]$Operation.input.expectedHeadSha
    if ($number -lt 1 -or $number -gt 2147483647 -or
        $expectedHead -cnotmatch "^[a-f0-9]{40}$" -or
        [string]$Operation.input.confirmation -cne "squash-merge") {
        throw "The human-approved squash merge input is invalid."
    }
    $pullRequest = Invoke-GitHubJson @(
        "pr", "view", "$number",
        "--repo", "mishrarishav/TraceGRN",
        "--json", "number,url,state,isDraft,baseRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup"
    )
    $validateChecks = @(
        $pullRequest.statusCheckRollup |
            Where-Object { [string]$_.name -ceq "validate" }
    )
    if ([int]$pullRequest.number -ne $number -or
        [string]$pullRequest.state -cne "OPEN" -or [bool]$pullRequest.isDraft -or
        [string]$pullRequest.baseRefName -cne "main" -or
        [string]$pullRequest.headRefOid -cne $expectedHead -or
        [string]$pullRequest.mergeable -cne "MERGEABLE" -or
        [string]$pullRequest.mergeStateStatus -cne "CLEAN" -or
        $validateChecks.Count -ne 1 -or
        [string]$validateChecks[0].status -cne "COMPLETED" -or
        [string]$validateChecks[0].conclusion -cne "SUCCESS") {
        throw "The TrackGRN pull request is not eligible for human-approved squash merge."
    }

    & $githubCliExecutable pr merge "$number" `
        --repo "mishrarishav/TraceGRN" `
        --squash `
        --match-head-commit $expectedHead `
        *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "The human-approved TrackGRN squash merge failed."
    }
    $merged = Invoke-GitHubJson @(
        "pr", "view", "$number",
        "--repo", "mishrarishav/TraceGRN",
        "--json", "number,url,state,headRefOid,mergeCommit"
    )
    if ([string]$merged.state -cne "MERGED" -or
        [string]$merged.headRefOid -cne $expectedHead -or
        [string]::IsNullOrWhiteSpace([string]$merged.mergeCommit.oid)) {
        throw "The TrackGRN squash merge result could not be verified."
    }
    Invoke-Git @("fetch", "origin", "main") | Out-Null
    Invoke-Git @("switch", "main") | Out-Null
    Invoke-Git @("merge", "--ff-only", "origin/main") | Out-Null
    $localMain = (Invoke-Git @("rev-parse", "HEAD") | Select-Object -First 1).Trim()
    return [ordered]@{
        pullRequestNumber = $number
        pullRequestUrl = [string]$merged.url
        reviewedHeadSha = $expectedHead
        mergeCommitSha = [string]$merged.mergeCommit.oid
        validateCheck = "SUCCESS"
        state = "MERGED"
        localBranch = "main"
        localHeadSha = $localMain
        mergedByHumanConfirmation = $true
    }
}

function Assert-VpnAndWinRm([hashtable]$Environment) {
    foreach ($key in @(
        "EESL_WINRM_HOST",
        "EESL_WINRM_PORT",
        "EESL_WINRM_AUTHENTICATION",
        "EESL_WINRM_USE_SSL",
        "EESL_WINRM_USERNAME",
        "EESL_WINRM_PASSWORD"
    )) {
        if ([string]::IsNullOrWhiteSpace([string]$Environment[$key])) {
            throw "A required TrackGRN deployment setting is missing."
        }
    }
    $probe = Test-NetConnection -ComputerName $Environment["EESL_WINRM_HOST"] `
        -Port ([int]$Environment["EESL_WINRM_PORT"]) `
        -WarningAction SilentlyContinue
    if (-not $probe.TcpTestSucceeded) {
        throw "vpn-required"
    }
}

function Deploy-TrackGrn([object]$Operation, [hashtable]$Environment) {
    $snapshot = Get-RepositorySnapshot
    if (-not $snapshot.clean) { throw "TrackGRN deployment requires a clean reviewed checkout." }
    if ($snapshot.headSha -cne [string]$Operation.input.expectedHeadSha) {
        throw "The deployment source SHA does not match the reviewed SHA."
    }
    Assert-VpnAndWinRm $Environment
    $build = Build-TrackGrn ([string]$Operation.operationId) $Environment
    $releasePath = Join-Path $serverReleaseRoot $snapshot.headSha

    $securePassword = ConvertTo-SecureString $Environment["EESL_WINRM_PASSWORD"] -AsPlainText -Force
    $credential = New-Object Management.Automation.PSCredential(
        $Environment["EESL_WINRM_USERNAME"],
        $securePassword
    )
    $sessionOptions = @{
        ComputerName = $Environment["EESL_WINRM_HOST"]
        Port = [int]$Environment["EESL_WINRM_PORT"]
        Authentication = $Environment["EESL_WINRM_AUTHENTICATION"]
        Credential = $credential
    }
    if ([Convert]::ToBoolean($Environment["EESL_WINRM_USE_SSL"])) {
        $sessionOptions["UseSSL"] = $true
    }

    $session = $null
    try {
        $session = New-PSSession @sessionOptions
        $exists = Invoke-Command -Session $session -ArgumentList $releasePath -ScriptBlock {
            param($Path)
            Test-Path -LiteralPath $Path
        }
        if ($exists) { throw "The immutable TrackGRN server release already exists." }
        Invoke-Command -Session $session -ArgumentList $releasePath -ScriptBlock {
            param($Path)
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
        }
        Copy-Item -Path (Join-Path $build.artifactPath "*") -Destination $releasePath `
            -ToSession $session -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $workspaceRoot $iisScriptRelativePath) `
            -Destination (Join-Path $releasePath "configure-iis-production.ps1") `
            -ToSession $session -Force
        $deploy = Invoke-Command -Session $session -ArgumentList @(
            $releasePath,
            [bool]$Operation.input.migrate,
            [bool]$Operation.input.seed
        ) -ScriptBlock {
            param($Path, $Migrate, $Seed)
            $arguments = @(
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", (Join-Path $Path "configure-iis-production.ps1"),
                "-PhysicalPath", $Path
            )
            if ($Migrate) { $arguments += "-Migrate" }
            if ($Seed) { $arguments += "-Seed" }
            & powershell.exe @arguments
            if ($LASTEXITCODE -ne 0) { throw "The TrackGRN IIS deployment failed." }
        }
        $healthUri = "https://tserver2.eeslindia.org/apiTrackGrn/health/live"
        $health = Invoke-WebRequest -UseBasicParsing -Uri $healthUri -TimeoutSec 20
        if ([int]$health.StatusCode -ne 200) { throw "The TrackGRN health probe failed." }
        $databaseStatusUri = "https://tserver2.eeslindia.org/apiTrackGrn/api/system/status"
        $databaseStatusResponse = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $databaseStatusUri `
            -TimeoutSec 20
        if ([int]$databaseStatusResponse.StatusCode -ne 200) {
            throw "The TrackGRN database status probe failed."
        }
        $databaseStatus = $databaseStatusResponse.Content | ConvertFrom-Json
        if ([string]$databaseStatus.database -cne "available") {
            throw "The TrackGRN database status probe failed."
        }
        return [ordered]@{
            sourceSha = $snapshot.headSha
            artifactSha256 = $build.artifactSha256
            serverReleasePath = $releasePath
            healthUri = $healthUri
            healthStatus = [int]$health.StatusCode
            databaseStatusUri = $databaseStatusUri
            databaseStatus = "available"
            migrationRequested = [bool]$Operation.input.migrate
            seedRequested = [bool]$Operation.input.seed
        }
    }
    finally {
        if ($null -ne $session) { Remove-PSSession -Session $session }
        $credential = $null
        $securePassword = $null
    }
}

function Invoke-AgentRequest(
    [string]$Method,
    [string]$Path,
    [string]$Token,
    [object]$Body = $null
) {
    $headers = @{
        Authorization = "Bearer $Token"
        "X-FrevOS-Agent-Id" = $agentId
        "X-FrevOS-Workspace-Id" = $agentWorkspaceId
    }
    $parameters = @{
        Method = $Method
        Uri = "$controlPlaneBase$Path"
        Headers = $headers
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
        "repository.inspect" { return Get-RepositorySnapshot }
        "repository.propose-commit" { return Get-CommitProposal }
        "repository.commit-push" { return Commit-AndPush $Operation }
        "repository.open-pull-request" { return Open-PullRequest $Operation }
        "repository.squash-merge" { return Squash-MergePullRequest $Operation }
        "project.build" { return Build-TrackGrn ([string]$Operation.operationId) $Environment }
        "uat.deploy" { return Deploy-TrackGrn $Operation $Environment }
        default { throw "The requested operation is not allowlisted by this agent." }
    }
}

Assert-AgentTooling
Assert-Workspace
if ($DiscoverySelfTest) {
    $discovery = Get-GitHubDiscovery
    [ordered]@{
        provider = $discovery.provider
        login = $discovery.account.login
        repositoryCount = @($discovery.repositories).Count
        credentialExported = $false
    } | ConvertTo-Json
    exit 0
}
if ($SelfTest) {
    Assert-GitHubOperator
    Get-RepositorySnapshot | ConvertTo-Json -Depth 6
    exit 0
}

$environment = Read-EnvironmentFile $environmentFile
$agentToken = [string]$environment["FREVOS_TRACKGRN_AGENT_TOKEN"]
if ([string]::IsNullOrWhiteSpace($agentToken) -or $agentToken.Length -lt 32) {
    throw "The TrackGRN agent token is missing or invalid."
}

do {
    try {
        $githubClaim = Invoke-AgentRequest `
            "POST" `
            "/v1/agents/github/claim" `
            $agentToken `
            ([ordered]@{})
        if ([int]$githubClaim.StatusCode -ne 204 -and
            -not [string]::IsNullOrWhiteSpace($githubClaim.Content)) {
            $githubOperation = $githubClaim.Content | ConvertFrom-Json
            try {
                $githubResult = Get-GitHubDiscovery
                $githubCompletion = [ordered]@{ status = "succeeded"; result = $githubResult }
            }
            catch {
                $githubFailure = [string]$_.Exception.Message
                $githubErrorCode = if ($githubFailure -in @(
                    "github-account-unavailable",
                    "github-repository-catalog-invalid"
                )) { $githubFailure } else { "github-account-unavailable" }
                $githubCompletion = [ordered]@{
                    status = "failed"
                    errorCode = $githubErrorCode
                    result = [ordered]@{
                        message = "The Windows GitHub CLI account could not be discovered."
                        failureStage = $githubErrorCode
                    }
                }
            }
            Invoke-AgentRequest "POST" `
                "/v1/agents/github/discovery/$($githubOperation.operationId)/complete" `
                $agentToken `
                $githubCompletion | Out-Null
            if (-not $Once) { continue }
            break
        }

        $claim = Invoke-AgentRequest `
            "POST" `
            "/v1/agents/trackgrn/claim" `
            $agentToken `
            ([ordered]@{})
        if ([int]$claim.StatusCode -eq 204 -or [string]::IsNullOrWhiteSpace($claim.Content)) {
            if (-not $Once) { Start-Sleep -Seconds $pollSeconds }
            continue
        }
        $operation = $claim.Content | ConvertFrom-Json
        try {
            $result = Invoke-Operation $operation $environment
            $completion = [ordered]@{ status = "succeeded"; result = $result }
        }
        catch {
            $knownErrorCodes = @(
                "vpn-required",
                "ui-build-failed",
                "api-tests-failed",
                "artifact-already-exists",
                "api-publish-failed"
            )
            $failure = [string]$_.Exception.Message
            $errorCode = if ($knownErrorCodes -ccontains $failure) { $failure } else { "operation-failed" }
            $completion = [ordered]@{
                status = "failed"
                errorCode = $errorCode
                result = [ordered]@{
                    message = "The allowlisted TrackGRN operation failed."
                    failureStage = $errorCode
                }
            }
        }
        Invoke-AgentRequest "POST" `
            "/v1/agents/trackgrn/operations/$($operation.operationId)/complete" `
            $agentToken `
            $completion | Out-Null
    }
    catch {
        if ($Once) { throw }
        Start-Sleep -Seconds $pollSeconds
    }
} while (-not $Once)
