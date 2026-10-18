# Use after LAN access is approved. Keeps the opt-in broker mapping on restarts.
$ErrorActionPreference='Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
 & "$PSScriptRoot/docker.ps1" compose --env-file .local/expo-pzem/compose.env -f compose.expo-local.yaml -f compose.expo-pzem-lan.yaml @args
 exit $LASTEXITCODE
} finally { Pop-Location }
