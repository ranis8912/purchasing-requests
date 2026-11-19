<#
.SYNOPSIS
  Build, test and deploy the Purchasing Request Portal to App Service.

.DESCRIPTION
  Run from the GES network or VPN: the App Service only has a private endpoint (public access off),
  so its deployment (SCM) endpoint can't be reached from GitHub-hosted or Microsoft-hosted build agents.

  This script deploys code only. App settings, Easy Auth and the startup command belong to infra
  (see README "One-time environment setup"). It never changes your default az subscription.

.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File ./deploy.ps1 -Subscription "<GES-AIS-Dv subscription id>"
#>
param(
    [string]$AppName = "app-wus2-purreq-dv",
    [string]$ResourceGroup = "rg-wus2-purreq-dv-services",
    [string]$Subscription = "",
    [switch]$SkipTests
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$sub = @(); if ($Subscription) { $sub = @("--subscription", $Subscription) }

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" } }

Step "Checking Azure sign-in"
$account = az account show @sub --query "{name:name, user:user.name}" -o json | ConvertFrom-Json; Check "az account show"
Write-Host "Subscription: $($account.name)  User: $($account.user)"
if (-not $ResourceGroup) {
    $ResourceGroup = az webapp list @sub --query "[?name=='$AppName'].resourceGroup | [0]" -o tsv; Check "az webapp list"
    if (-not $ResourceGroup) { throw "App '$AppName' not found in this subscription. Pass -Subscription or -ResourceGroup." }
}
Write-Host "Target: $AppName ($ResourceGroup)"

if (-not $SkipTests) {
    Step "Running backend tests"
    Push-Location "$root/backend"
    try { & ./.venv/Scripts/python -m pytest -q -p no:warnings; Check "pytest" } finally { Pop-Location }
}

Step "Building frontend"
Push-Location "$root/frontend"
try { npm ci --no-audit --no-fund; Check "npm ci"; npm run build; Check "npm run build" } finally { Pop-Location }

Step "Packaging"
$zip = Join-Path $env:TEMP "purreq-$(Get-Date -Format yyyyMMdd-HHmmss).zip"
& "$root/backend/.venv/Scripts/python" "$root/scripts/package.py" $zip; Check "package.py"

Step "Deploying (async; then polling status)"
az webapp deploy @sub -g $ResourceGroup -n $AppName --src-path $zip --type zip --async true --restart true | Out-Null
Check "az webapp deploy"

# The deploy client can hang or report 502 while Kudu finishes, so poll Kudu's deployment record instead.
$scm = az webapp show @sub -g $ResourceGroup -n $AppName --query "hostNameSslStates[?hostType=='Repository'].name | [0]" -o tsv; Check "az webapp show"
$deadline = (Get-Date).AddMinutes(10)
do {
    Start-Sleep -Seconds 10
    $status = az rest --method get --url "https://$scm/api/deployments/latest" --resource "https://management.azure.com/" --query "status" -o tsv 2>$null
    Write-Host "  deployment status: $status (4 = success, 3 = failed)"
} until ($status -in @("3", "4") -or (Get-Date) -gt $deadline)
if ($status -ne "4") { throw "Deployment did not succeed (status '$status'). See https://$scm/api/deployments/latest/log" }

Remove-Item $zip -ErrorAction SilentlyContinue
Step "Done"
Write-Host "Deployed. The first start after a requirements change installs packages (about a minute of 503 is normal)."
Write-Host "Check in a browser (InPrivate recommended): https://$AppName.azurewebsites.net  then hard-refresh with Ctrl+Shift+R."
