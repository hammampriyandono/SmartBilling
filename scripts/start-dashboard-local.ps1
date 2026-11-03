# Dashboard on this laptop; preserve device authentication without opening LAN.
$ErrorActionPreference='Stop'
$taskPreviousBind=$env:PZEM_DASHBOARD_BIND_IP
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
 $env:PZEM_DASHBOARD_BIND_IP='127.0.0.1'
 & "$PSScriptRoot/expo-pzem.ps1" up -d --no-build --pull never --wait --wait-timeout 60 postgres mqtt backend
 if($LASTEXITCODE -ne 0){throw 'Dashboard belum siap. Periksa apakah Docker Desktop sudah berjalan.'}
 Write-Output 'Dashboard siap: http://127.0.0.1:3001'
 Write-Output 'Mode lokal laptop; koneksi ESP melalui hotspot memakai mode LAN tersendiri.'
} finally {
 if($null -eq $taskPreviousBind){Remove-Item Env:PZEM_DASHBOARD_BIND_IP -ErrorAction SilentlyContinue}else{$env:PZEM_DASHBOARD_BIND_IP=$taskPreviousBind}
 Pop-Location
}
