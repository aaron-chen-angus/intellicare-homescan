# Runs tests/tests.html in headless Chrome (no Node or npm needed) and prints the result.
# Usage: powershell -File tests/run-headless.ps1
$root = Split-Path -Parent $PSScriptRoot
$chrome = @("C:\Program Files\Google\Chrome\Application\chrome.exe", "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Write-Error "Chrome or Edge not found"; exit 2 }

$page = Join-Path $root "tests\tests.html"
$url = "file:///" + (($page -replace '\\', '/') -replace ' ', '%20')
$out = Join-Path $env:TEMP "hs_tests_dom.html"
Start-Process -FilePath $chrome -Wait -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError "$out.err" -ArgumentList @(
  "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--virtual-time-budget=30000", "--dump-dom", "`"$url`"")

$dom = Get-Content $out -Raw
$summary = [regex]::Match($dom, 'id="summary"[^>]*>([^<]*)<').Groups[1].Value
Write-Output $summary
foreach ($m in [regex]::Matches($dom, '<li class="f">(.*?)</li>', 'Singleline')) {
  Write-Output ("FAIL: " + ($m.Groups[1].Value -replace '<[^>]+>', ' '))
}
if ($summary -match ' 0 failed') { exit 0 } else { exit 1 }
