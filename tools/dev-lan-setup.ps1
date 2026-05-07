<#
.SYNOPSIS
  One-shot Windows setup for LAN-from-phone testing of the dev stack.

.DESCRIPTION
  Detects the active LAN IP, opens Windows Firewall on private profiles
  for ports 3000 (web), 4000 (api) and 54321 (Supabase), and adds a
  netsh portproxy from <LAN IP>:54321 -> 127.0.0.1:54321 so the phone
  can reach Supabase Auth + Storage (which Docker only binds to
  loopback by default).

  All operations are idempotent : safe to re-run after reboots, after
  `pnpm supabase stop && start`, etc.

.PARAMETER LanIp
  Override the auto-detected LAN IP. Useful when the dev machine is on
  multiple subnets and you want a specific one.

.PARAMETER Remove
  Reverse every change : delete the firewall rules + portproxy
  forwarding. Use when you're done testing.

.NOTES
  Run from an Administrator PowerShell prompt. Will exit with an error
  message if not elevated.

.EXAMPLE
  # Set up
  .\tools\dev-lan-setup.ps1

.EXAMPLE
  # Force a specific IP
  .\tools\dev-lan-setup.ps1 -LanIp 10.0.0.208

.EXAMPLE
  # Tear down
  .\tools\dev-lan-setup.ps1 -Remove
#>
param(
  [string]$LanIp,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

function Test-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Host "ERROR : run this script from an elevated (Administrator) PowerShell." -ForegroundColor Red
  Write-Host "        Right-click PowerShell > 'Run as administrator', then re-run."
  exit 1
}

function Get-LanIp {
  # Prefer the IPv4 address on the interface that owns the default
  # route (i.e. the one routed to the Internet, which is also the
  # interface a phone on the same Wi-Fi will reach the dev PC on).
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object -Property RouteMetric, ifMetric |
    Select-Object -First 1
  if (-not $route) {
    throw "Could not determine the default-route interface ; pass -LanIp explicitly."
  }
  $ip = Get-NetIPAddress -InterfaceIndex $route.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1
  if (-not $ip) {
    throw "Default-route interface has no IPv4 address ; pass -LanIp explicitly."
  }
  return $ip.IPAddress
}

if (-not $LanIp -or $LanIp.Length -eq 0) {
  $LanIp = Get-LanIp
  Write-Host "Auto-detected LAN IP : $LanIp" -ForegroundColor Cyan
} else {
  Write-Host "Using LAN IP from argument : $LanIp" -ForegroundColor Cyan
}

$ports = @(
  @{ Port = 3000; Name = "Monark dev web"; ProxyHostside = $false }
  @{ Port = 4000; Name = "Monark dev api"; ProxyHostside = $false }
  @{ Port = 54321; Name = "Monark dev supabase"; ProxyHostside = $true }
)

if ($Remove) {
  Write-Host ""
  Write-Host "Removing dev LAN setup..." -ForegroundColor Yellow

  foreach ($p in $ports) {
    $rule = Get-NetFirewallRule -DisplayName $p.Name -ErrorAction SilentlyContinue
    if ($rule) {
      Remove-NetFirewallRule -DisplayName $p.Name
      Write-Host "  - removed firewall rule '$($p.Name)' (port $($p.Port))"
    }
    if ($p.ProxyHostside) {
      $proxy = netsh interface portproxy show all | Select-String "$LanIp\s+$($p.Port)"
      if ($proxy) {
        netsh interface portproxy delete v4tov4 listenaddress=$LanIp listenport=$p.Port | Out-Null
        Write-Host "  - removed portproxy ${LanIp}:$($p.Port) -> 127.0.0.1:$($p.Port)"
      }
    }
  }

  Write-Host ""
  Write-Host "Done. Re-run without -Remove to set things back up." -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "Setting up dev LAN access..." -ForegroundColor Yellow

foreach ($p in $ports) {
  # Firewall rule (private profile only ; never opens the port to
  # public networks like a coffee shop Wi-Fi).
  $existing = Get-NetFirewallRule -DisplayName $p.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "  - firewall rule '$($p.Name)' already exists"
  } else {
    New-NetFirewallRule `
      -DisplayName $p.Name `
      -Direction Inbound `
      -Protocol TCP `
      -LocalPort $p.Port `
      -Action Allow `
      -Profile Private | Out-Null
    Write-Host "  - added firewall rule '$($p.Name)' for port $($p.Port) (Private profile)"
  }

  if ($p.ProxyHostside) {
    # Re-publish loopback-bound services on the LAN IP. Idempotent :
    # delete first if present, then add, so a stale entry doesn't
    # persist.
    netsh interface portproxy delete v4tov4 listenaddress=$LanIp listenport=$p.Port 2>$null | Out-Null
    netsh interface portproxy add v4tov4 listenaddress=$LanIp listenport=$p.Port connectaddress=127.0.0.1 connectport=$p.Port | Out-Null
    Write-Host "  - added portproxy ${LanIp}:$($p.Port) -> 127.0.0.1:$($p.Port)"
  }
}

Write-Host ""
Write-Host "Verifying..." -ForegroundColor Yellow

foreach ($p in $ports) {
  $test = Test-NetConnection -ComputerName $LanIp -Port $p.Port -InformationLevel Quiet -WarningAction SilentlyContinue
  if ($test) {
    Write-Host "  + ${LanIp}:$($p.Port) reachable" -ForegroundColor Green
  } else {
    Write-Host "  ! ${LanIp}:$($p.Port) NOT reachable" -ForegroundColor Red
    Write-Host "    - is the corresponding service running ? (pnpm dev / pnpm supabase start)" -ForegroundColor DarkYellow
    Write-Host "    - is your network profile actually 'Private' ? Check with : Get-NetConnectionProfile" -ForegroundColor DarkYellow
  }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Open http://${LanIp}:3000 from your phone." -ForegroundColor Cyan
Write-Host "Visit http://${LanIp}:3000/dev-diagnostics on the phone to verify each layer is reachable."
Write-Host ""
Write-Host "To remove everything later : .\tools\dev-lan-setup.ps1 -Remove"
