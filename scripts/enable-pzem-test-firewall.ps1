# Run in Administrator PowerShell. Opens only this Wi-Fi IPv4 and its /24 subnet.
param([string]$LanAddress = '192.168.1.8')
$ErrorActionPreference = 'Stop'
$address = Get-NetIPAddress -AddressFamily IPv4 -IPAddress $LanAddress
if ($address.InterfaceAlias -ne 'Wi-Fi' -or $address.PrefixLength -ne 24 -or $LanAddress -notmatch '^192\.168\.1\.\d+$') {
    throw 'Alamat harus IPv4 Wi-Fi aktif pada subnet uji 192.168.1.0/24.'
}
$ruleName = 'SmartBilling-PZEM-Test-MQTT'
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    # Refuse to silently reuse a differently configured rule.
    $port = $existing | Get-NetFirewallPortFilter
    $scope = $existing | Get-NetFirewallAddressFilter
    $network = $existing | Get-NetFirewallInterfaceFilter
    if ($existing.Enabled -ne 'True' -or $existing.Direction -ne 'Inbound' -or $existing.Action -ne 'Allow' -or
        $port.LocalPort -ne '1883' -or $port.Protocol -ne 'TCP' -or
        @($scope.LocalAddress).Count -ne 1 -or $scope.LocalAddress -ne $LanAddress -or
        @($scope.RemoteAddress).Count -ne 1 -or $scope.RemoteAddress -notin @('192.168.1.0/24', '192.168.1.0/255.255.255.0') -or
        $network.InterfaceAlias -ne 'Wi-Fi') {
        throw 'Rule existing berbeda. Periksa sebelum memperluas/mengubah akses.'
    }
    Write-Output 'Rule firewall terbatas sudah tersedia.'
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'SmartBilling PZEM test MQTT (Wi-Fi lokal)' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 1883 `
        -LocalAddress $LanAddress -RemoteAddress '192.168.1.0/24' `
        -InterfaceAlias 'Wi-Fi' -Profile Any -Enabled True -ErrorAction Stop | Out-Null
    if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction Stop)) {
        throw 'Rule firewall belum berhasil dibuat.'
    }
    Write-Output 'Rule firewall dibuat: TCP 1883, hanya Wi-Fi 192.168.1.8 dan subnet 192.168.1.0/24.'
}
