# Minimal static file server for local preview (no Python or Node needed).
# Usage:  powershell -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8080]
# Then open http://localhost:8080/  (localhost counts as a secure context, so the camera works).
# -ReportFile <path>: test-only; accepts POST /__report from tests/e2e.html and writes the body there.
param([int]$Port = 8080, [string]$ReportFile = '')
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.webmanifest'='application/manifest+json';
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.onnx'='application/octet-stream'; '.md'='text/plain; charset=utf-8' }
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $res = $ctx.Response
    if ($ReportFile -and $rel -eq '__report' -and $ctx.Request.HttpMethod -eq 'POST') {
      $body = [IO.StreamReader]::new($ctx.Request.InputStream).ReadToEnd()
      [IO.File]::WriteAllText($ReportFile, $body)
      $res.StatusCode = 204
    } elseif (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf)) {
      $res.StatusCode = 404
    } else {
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
      $res.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [IO.File]::ReadAllBytes($full)
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $res.Close()
  }
} finally { $listener.Stop() }
