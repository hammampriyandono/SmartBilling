param(
  [Parameter(Mandatory=$true)][ValidateSet('owner','tenant')][string]$Role,
  [switch]$GeneratePassword
)
$ErrorActionPreference='Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  $secretDir=Join-Path (Get-Location) '.local/secrets'
  New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
  $passwordPath=Join-Path $secretDir ($Role+'_login_password')
  if (-not (Test-Path -LiteralPath $passwordPath)) {
    if ($GeneratePassword) {
      $bytes=New-Object byte[] 32
      $rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
      try {$rng.GetBytes($bytes)} finally {$rng.Dispose()}
      $plain=[Convert]::ToBase64String($bytes)
    } else {
      $secure=Read-Host 'Password akun demo (minimal 12 karakter; tidak ditampilkan)' -AsSecureString
      $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try {$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    }
    if ($plain.Length -lt 12) {throw 'Password minimal 12 karakter'}
    [IO.File]::WriteAllText($passwordPath,$plain,[Text.UTF8Encoding]::new($false))
    $plain=$null
  }
  # Pass only the file path; password is never a shell argument or console output.
  & "$PSScriptRoot/docker.ps1" compose run --rm --no-deps -v "${passwordPath}:/run/provision_password:ro" backend node scripts/provision.js $Role /run/provision_password
  if ($LASTEXITCODE -ne 0) {throw 'Provisioning gagal; periksa pesan tanpa menghapus data'}
  Write-Host "Password tidak dicetak. Berkas lokal terabaikan Git: $passwordPath"
} finally {Pop-Location}
