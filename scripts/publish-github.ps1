param(
  [Parameter(Mandatory = $true)]
  [string]$RemoteUrl
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
}

git status --short

$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
  git remote set-url origin $RemoteUrl
} else {
  git remote add origin $RemoteUrl
}

git branch -M main
git push -u origin main

Write-Host "Published to $RemoteUrl"
