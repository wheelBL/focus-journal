$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$release = Join-Path $root 'release'
$source = Join-Path $release "win-$version"
$compiler = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
if (-not (Test-Path $compiler)) { $compiler = (Get-Command ISCC.exe -ErrorAction Stop).Source }
& $compiler "/DAppVersion=$version" "/DPackagePath=$source" "/DOutputPath=$release" (Join-Path $root 'build/windows-setup.iss')
if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed ($LASTEXITCODE)." }
$name = "FocusJournal-$version-Windows-x64-Setup.exe"
$sha = (Get-FileHash (Join-Path $release $name) -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::AppendAllText((Join-Path $release 'SHA256SUMS-Windows-x64.txt'), "$sha  $name`n")
