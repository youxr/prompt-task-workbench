param(
  [Parameter(Mandatory = $true)]
  [string]$RemoteUrl
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

git status --short

$existing = $null
try {
  $existing = git remote get-url origin 2>$null
} catch {
  $existing = $null
}

if ($existing) {
  git remote set-url origin $RemoteUrl
} else {
  git remote add origin $RemoteUrl
}

git branch -M main
git push -u origin main

Write-Host "Published to $RemoteUrl"
