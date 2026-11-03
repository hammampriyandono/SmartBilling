param([string]$LanAddress='', [switch]$PlanOnly)
$ErrorActionPreference='Stop'
if (-not $LanAddress) {
 $candidates=@(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi' | Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -notlike '169.254.*' })
 if ($candidates.Count -ne 1) { throw 'Pilih satu alamat Wi-Fi aktif melalui -LanAddress.' }
 $LanAddress=$candidates[0].IPAddress
}
$address=Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LanAddress
if ($address.InterfaceAlias -ne 'Wi-Fi' -or $address.PrefixLength -ne 24 -or $LanAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw 'Perlu alamat Wi-Fi privat aktif dengan prefix /24.' }
$octets=([System.Net.IPAddress]::Parse($LanAddress)).GetAddressBytes()
$octets[3]=0
$subnet=(([System.Net.IPAddress]::new($octets)).ToString())+'/24'
$subnetMask=(([System.Net.IPAddress]::new($octets)).ToString())+'/255.255.255.0'
$name='SmartBilling-PZEM-Dashboard-MQTT'
if ($PlanOnly) {
 [pscustomobject]@{Name=$name;LocalAddress=$LanAddress;RemoteAddress=$subnet;InterfaceAlias='Wi-Fi';Protocol='TCP';LocalPort=1884}
 return
}
$existing=Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
if ($existing) {
 $port=$existing|Get-NetFirewallPortFilter
 $scope=$existing|Get-NetFirewallAddressFilter
 $network=$existing|Get-NetFirewallInterfaceFilter
 if ($existing.Enabled -ne 'True' -or $existing.Direction -ne 'Inbound' -or $existing.Action -ne 'Allow' -or $port.Protocol -ne 'TCP' -or $port.LocalPort -ne '1884' -or @($scope.LocalAddress).Count -ne 1 -or $scope.LocalAddress -ne $LanAddress -or @($scope.RemoteAddress).Count -ne 1 -or $scope.RemoteAddress -notin @($subnet,$subnetMask) -or $network.InterfaceAlias -ne 'Wi-Fi') { throw 'Konfigurasi rule existing berbeda; tidak ditimpa.' }
 Write-Output 'Rule LAN dashboard sudah sesuai.'
} else {
 New-NetFirewallRule -Name $name -DisplayName 'SmartBilling PZEM dashboard MQTT (Wi-Fi lokal)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 1884 -LocalAddress $LanAddress -RemoteAddress $subnet -InterfaceAlias 'Wi-Fi' -Profile Any -Enabled True -ErrorAction Stop | Out-Null
 Write-Output 'Rule LAN dashboard dibuat: hanya Wi-Fi/subnet lokal, TCP 1884.'
}
