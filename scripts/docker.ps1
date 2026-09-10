# Gunakan Docker dalam PATH atau instalasi per-user tanpa mengubah PATH Windows.
$ErrorActionPreference = 'Stop'
$dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
$dockerPath = if ($dockerCommand) { $dockerCommand.Source } else {
    Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe'
}
if (-not (Test-Path -LiteralPath $dockerPath)) {
    throw 'Docker CLI tidak ditemukan. Periksa instalasi Docker Desktop.'
}
& $dockerPath @args
exit $LASTEXITCODE
