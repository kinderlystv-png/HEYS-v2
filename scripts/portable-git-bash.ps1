# Portable Git Bash for Windows agents (Codex / Cursor).
# Adds bash + coreutils to PATH, then runs bash with forwarded args.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$BashArgs
)

$PortableGit = Join-Path $env:LOCALAPPDATA 'CodexTools\PortableGit'
if (-not (Test-Path (Join-Path $PortableGit 'bin\bash.exe'))) {
    $PortableGit = 'C:\Program Files\Git'
}
$bash = Join-Path $PortableGit 'bin\bash.exe'
if (-not (Test-Path $bash)) {
    Write-Error "bash not found. Install Git for Windows or PortableGit at $PortableGit"
    exit 1
}

$bin = Join-Path $PortableGit 'bin'
$usrBin = Join-Path $PortableGit 'usr\bin'
$env:PATH = "$bin;$usrBin;$env:PATH"
$env:HEYS_BASH = $bash
$env:HEYS_PORTABLE_GIT = $PortableGit

& $bash @BashArgs
exit $LASTEXITCODE
