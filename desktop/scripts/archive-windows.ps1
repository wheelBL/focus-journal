$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem

$desktopRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $desktopRoot 'package.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$releaseRoot = Join-Path $desktopRoot 'release'
$packageRoot = (Resolve-Path -LiteralPath (Join-Path $releaseRoot "win-$version")).Path
$info = Get-Content -LiteralPath (Join-Path $packageRoot 'build-info.json') -Raw | ConvertFrom-Json
if ($info.qa -or $info.app -ne $version -or $info.platform -ne 'win32-x64') { throw 'Expected the production Windows x64 package.' }
$productionCheck = Get-Content -LiteralPath (Join-Path $desktopRoot "qa-evidence/release-$version/production-check.json") -Raw | ConvertFrom-Json
$asarHash = (Get-FileHash -LiteralPath (Join-Path $packageRoot 'resources/app.asar') -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $productionCheck.codeIdentical -or $productionCheck.version -ne $version -or $productionCheck.asarSha256 -ne $asarHash -or $info.asarSha256 -ne $asarHash) {
    throw 'Verify the current production package against the tested QA code before archiving.'
}
$files = @(Get-ChildItem -LiteralPath $packageRoot -File -Recurse)
if ($files.Name -match '(^qa-|\.sqlite($|-)|\.db($|-)|^\.env|^(journal|ai-config|sync-config|local-api|usage-records)\.)') {
    throw 'Unexpected QA or private data in the production directory.'
}
$archiveName = "FocusJournal-$version-Windows-x64.zip"
$archivePath = Join-Path $releaseRoot $archiveName
if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists: $archivePath. Use a fresh output directory; do not replace published packages." }
[System.IO.Compression.ZipFile]::CreateFromDirectory($packageRoot, $archivePath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @($archive.Entries | Where-Object { $_.Name })
    if ($entries.Count -ne $files.Count) { throw 'Archive file count differs from the production directory.' }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
        $entry = $archive.GetEntry($relative)
        if (-not $entry -or $entry.Length -ne $file.Length) { throw "Missing or truncated archive entry: $relative" }
        $stream = $entry.Open()
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        try { $entryHash = [System.BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $hasher.Dispose() }
        if ($entryHash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) { throw "Archive checksum mismatch: $relative" }
    }
} finally { $archive.Dispose() }
$sha = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText((Join-Path $releaseRoot 'SHA256SUMS-Windows-x64.txt'), "$sha  $archiveName`n")
$runUrl = if ($env:GITHUB_RUN_ID) { "$env:GITHUB_SERVER_URL/$env:GITHUB_REPOSITORY/actions/runs/$env:GITHUB_RUN_ID" } else { $null }
$provenance = [ordered]@{ version = $version; platform = 'win32-x64'; commit = $env:GITHUB_SHA; workflowRun = $runUrl; archive = $archiveName; sha256 = $sha; asarSha256 = $asarHash }
[System.IO.File]::WriteAllText((Join-Path $releaseRoot 'build-provenance-Windows-x64.json'), ($provenance | ConvertTo-Json))
$check = [ordered]@{ version = $version; filesVerified = $files.Count; archiveVerified = $true; sha256 = $sha }
[System.IO.File]::WriteAllText((Join-Path $desktopRoot "qa-evidence/release-$version/archive-check.json"), ($check | ConvertTo-Json))
Write-Output "Verified $($files.Count) archive files: $archiveName"
