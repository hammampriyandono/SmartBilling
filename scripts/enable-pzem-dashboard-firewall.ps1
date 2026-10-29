param([string]$LanAddress='192.168.1.9')
$ErrorActionPreference='Stop'
$address=Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LanAddress
if ($address.InterfaceAlias -ne 'Wi-Fi' -or $address.PrefixLength -ne 24 -or $LanAddress -notmatch '^192\.168\.1\.\d+$') { throw 'Perlu alamat Wi-Fi pada subnet uji 192.168.1.0/24.' }
$name='SmartBilling-PZEM-Dashboard-MQTT'
$existing=Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
if ($existing) {
 $port=$existing|Get-NetFirewallPortFilter
 $scope=$existing|Get-NetFirewallAddressFilter
 $network=$existing|Get-NetFirewallInterfaceFilter
 if ($existing.Enabled -ne 'True' -or $existing.Direction -ne 'Inbound' -or $existing.Action -ne 'Allow' -or $port.Protocol -ne 'TCP' -or $port.LocalPort -ne '1884' -or @($scope.LocalAddress).Count -ne 1 -or $scope.LocalAddress -ne $LanAddress -or @($scope.RemoteAddress).Count -ne 1 -or $scope.RemoteAddress -notin @('192.168.1.0/24','192.168.1.0/255.255.255.0') -or $network.InterfaceAlias -ne 'Wi-Fi') { throw 'Konfigurasi rule existing berbeda; tidak ditimpa.' }
 Write-Output 'Rule LAN dashboard sudah sesuai.'
} else {
 New-NetFirewallRule -Name $name -DisplayName 'SmartBilling PZEM dashboard MQTT (Wi-Fi lokal)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 1884 -LocalAddress $LanAddress -RemoteAddress '192.168.1.0/24' -InterfaceAlias 'Wi-Fi' -Profile Any -Enabled True -ErrorAction Stop | Out-Null
 Write-Output 'Rule LAN dashboard dibuat: hanya Wi-Fi/subnet lokal, TCP 1884.'
}
