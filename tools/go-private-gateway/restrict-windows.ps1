$ErrorActionPreference = 'Stop'
$goLog = Join-Path $PSScriptRoot 'restriction-result.json'
$goRuleNames = @('GO5G-BlockOtherPeers','GO5G-BlockOtherTCPPorts','GO5G-BlockUDP','GO5G-AllowIPhone','GO5G-BlockIPv6')
$goCreated = @()
$goTs = 'C:\Program Files\Tailscale\tailscale.exe'
try {
  $goIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not ([Security.Principal.WindowsPrincipal]::new($goIdentity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator approval is required.' }
  $goStatus = (& $goTs status --json | ConvertFrom-Json)
  $goPrefs = (& $goTs debug prefs | ConvertFrom-Json)
  if ($goStatus.BackendState -ne 'Running' -or '100.105.48.111' -notin $goStatus.TailscaleIPs -or -not $goPrefs.ShieldsUp) { throw 'Unexpected VPN state. Keep incoming traffic blocked and review.' }
  $goPeer = @($goStatus.Peer.PSObject.Properties.Value | Where-Object { '100.69.103.120' -in $_.TailscaleIPs -and $_.OS -eq 'iOS' })
  if ($goPeer.Count -ne 1) { throw 'The authorized iPhone is not present.' }
  if ((Get-NetAdapter -Name 'Tailscale').InterfaceDescription -ne 'Tailscale Tunnel') { throw 'Unexpected network interface.' }
  if (@(Get-NetFirewallProfile | Where-Object { -not $_.Enabled }).Count) { throw 'Firewall protection is not active for all profiles.' }
  foreach ($goName in $goRuleNames) { if (Get-NetFirewallRule -Name $goName -ErrorAction SilentlyContinue) { throw 'A GO5G rule already exists. Review before changing it.' } }
  $goCommon = @{Group='GO Private 5G';Direction='Inbound';Profile='Any';InterfaceAlias='Tailscale';Enabled='True';PolicyStore='PersistentStore'}
  New-NetFirewallRule @goCommon -Name $goRuleNames[0] -DisplayName 'GO5G block all peers except authorized iPhone IPv4' -Action Block -Protocol Any -RemoteAddress @('100.96.0.0/11','100.80.0.0/12','100.72.0.0/13','100.64.0.0/14','100.70.0.0/15','100.68.0.0/16','100.69.128.0/17','100.69.0.0/18','100.69.64.0/19','100.69.112.0/20','100.69.104.0/21','100.69.96.0/22','100.69.100.0/23','100.69.102.0/24','100.69.103.128/25','100.69.103.0/26','100.69.103.64/27','100.69.103.96/28','100.69.103.112/29','100.69.103.124/30','100.69.103.122/31','100.69.103.121/32') | Out-Null
  $goCreated += $goRuleNames[0]
  New-NetFirewallRule @goCommon -Name $goRuleNames[4] -DisplayName 'GO5G block private VPN IPv6; use authorized IPv4 only' -Action Block -Protocol Any -RemoteAddress 'fd7a:115c:a1e0::/48' | Out-Null
  $goCreated += $goRuleNames[4]
  New-NetFirewallRule @goCommon -Name $goRuleNames[1] -DisplayName 'GO5G block all other TCP ports including backend 3000' -Action Block -Protocol TCP -LocalPort @('1-3000','3002-8085','8087-65535') | Out-Null
  $goCreated += $goRuleNames[1]
  New-NetFirewallRule @goCommon -Name $goRuleNames[2] -DisplayName 'GO5G block UDP on VPN interface' -Action Block -Protocol UDP | Out-Null
  $goCreated += $goRuleNames[2]
  New-NetFirewallRule @goCommon -Name $goRuleNames[3] -DisplayName 'GO5G allow authorized iPhone to read-only gateway and Metro' -Action Allow -Protocol TCP -LocalAddress '100.105.48.111' -RemoteAddress '100.69.103.120' -LocalPort @(3001,8086) | Out-Null
  $goCreated += $goRuleNames[3]
  foreach ($goName in $goRuleNames) {
    $goRule = Get-NetFirewallRule -Name $goName -PolicyStore ActiveStore
    if ($goRule.Enabled -ne 'True' -or $goRule.PrimaryStatus -ne 'OK') { throw 'A required restriction is not active.' }
  }
  & $goTs set --shields-up=false
  if ($LASTEXITCODE -ne 0) { throw 'Could not enable the restricted private connection.' }
  [pscustomobject]@{Success=$true;PC='100.105.48.111';IPhone='100.69.103.120';AllowedTCP=@(3001,8086);Backend3000Blocked=$true;Time=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $goLog -Encoding utf8
} catch {
  if ($goCreated.Count) {
    & $goTs set --shields-up=true
    foreach ($goName in $goCreated) { Remove-NetFirewallRule -Name $goName -ErrorAction SilentlyContinue }
  }
  [pscustomobject]@{Success=$false;Error=$_.Exception.Message;Time=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $goLog -Encoding utf8
  exit 1
}
