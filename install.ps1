# News — Windows kurulum betiği (PowerShell)
#   irm https://raw.githubusercontent.com/yunusemre/AI-News/main/install.ps1 | iex
# Tarayıcı yerine PowerShell ile indirildiği için SmartScreen "Windows bilgisayarınızı korudu" uyarısı çıkmaz.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Write-Host "📰 News kuruluyor..."
$rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/yunusemre/AI-News/releases/latest' -Headers @{ 'User-Agent' = 'News-Installer' }
$asset = $rel.assets | Where-Object { $_.name -like '*.exe' } | Select-Object -First 1
if (-not $asset) { throw 'Son sürüm bulunamadı.' }
$out = Join-Path $env:TEMP 'News-Setup.exe'
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out -UseBasicParsing
Unblock-File -Path $out
Get-Process -Name 'News' -ErrorAction SilentlyContinue | Stop-Process -Force
# /S: sessiz kurulum, --force-run: kurulumdan sonra uygulamayı aç
Start-Process -FilePath $out -ArgumentList '/S', '--force-run' -Wait
Write-Host "✅ News $($rel.tag_name) kuruldu."
