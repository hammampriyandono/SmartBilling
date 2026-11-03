$ErrorActionPreference='Stop'
$targetScript=Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts/enable-pzem-dashboard-firewall.ps1'
$global:smartBillingFirewallFixture=$null
function Get-NetIPAddress {
 param($AddressFamily,$IPAddress,$InterfaceAlias)
 return $global:smartBillingFirewallFixture
}
function New-NetFirewallRule {throw 'Tes tidak boleh mengubah firewall.'}
function Get-NetFirewallRule {throw 'Mode rencana tidak perlu membaca rule.'}
foreach($case in @(
 @{Address='192.168.100.182';Subnet='192.168.100.0/24'},
 @{Address='192.168.1.9';Subnet='192.168.1.0/24'},
 @{Address='10.163.160.204';Subnet='10.163.160.0/24'},
 @{Address='172.20.1.8';Subnet='172.20.1.0/24'}
)){
 $global:smartBillingFirewallFixture=[pscustomobject]@{IPAddress=$case.Address;InterfaceAlias='Wi-Fi';PrefixLength=24;AddressState='Preferred'}
 $plan=& $targetScript -LanAddress $case.Address -PlanOnly
 if($plan.LocalAddress -ne $case.Address -or $plan.RemoteAddress -ne $case.Subnet -or $plan.LocalPort -ne 1884 -or $plan.InterfaceAlias -ne 'Wi-Fi'){throw 'Rencana tidak sesuai scope.'}
}
foreach($case in @(
 @{Address='8.8.8.8';Interface='Wi-Fi';Prefix=24},
 @{Address='172.32.1.8';Interface='Wi-Fi';Prefix=24},
 @{Address='169.254.1.8';Interface='Wi-Fi';Prefix=24},
 @{Address='192.168.100.182';Interface='Ethernet';Prefix=24},
 @{Address='10.1.2.3';Interface='Wi-Fi';Prefix=16}
)){
 $global:smartBillingFirewallFixture=[pscustomobject]@{IPAddress=$case.Address;InterfaceAlias=$case.Interface;PrefixLength=$case.Prefix;AddressState='Preferred'}
 $rejected=$false
 try{& $targetScript -LanAddress $case.Address -PlanOnly | Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'Alamat/interface/prefix yang tidak diizinkan harus ditolak.'}
}
$global:smartBillingFirewallFixture=[pscustomobject]@{IPAddress='10.1.2.3';InterfaceAlias='Wi-Fi';PrefixLength=24;AddressState='Preferred'}
if((& $targetScript -PlanOnly).LocalAddress -ne '10.1.2.3'){throw 'Deteksi alamat Wi-Fi gagal.'}
$global:smartBillingFirewallFixture=@($global:smartBillingFirewallFixture,$global:smartBillingFirewallFixture)
$rejected=$false
try{& $targetScript -PlanOnly | Out-Null}catch{$rejected=$true}
if(-not $rejected){throw 'Alamat ambigu harus ditolak.'}
Write-Output 'PASS: empat subnet privat, lima scope invalid, deteksi tunggal dan alamat ambigu; tanpa mutasi firewall.'
