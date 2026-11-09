param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$listener = $null

foreach ($port in 8766..8775) {
    $url = "http://localhost:$port/"
    $candidate = [System.Net.HttpListener]::new()
    $candidate.Prefixes.Add($url)
    try {
        $candidate.Start()
        $listener = $candidate
        break
    } catch [System.Net.HttpListenerException] {
        $candidate.Close()
    }
}

if (!$listener) {
    throw 'BirdClock could not start on ports 8766 through 8775. Close older BirdClock windows and try again.'
}

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.js' = 'application/javascript; charset=utf-8'
    '.webmanifest' = 'application/manifest+json'
    '.css' = 'text/css'
}

try {
    Write-Host "BirdClock is running at $url. Keep this window open. Press Ctrl+C to stop."
    if (!$NoBrowser) { Start-Process $url }

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        try {
            $name = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
            if (!$name) { $name = 'index.html' }
            $path = Join-Path $root ([IO.Path]::GetFileName($name))
            if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
                $response.StatusCode = 404
                continue
            }

            $bytes = [IO.File]::ReadAllBytes($path)
            $extension = [IO.Path]::GetExtension($path)
            $response.ContentType = if ($types.ContainsKey($extension)) { $types[$extension] } else { 'application/octet-stream' }
            $response.Headers['Cache-Control'] = 'no-store'
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } finally {
            $response.Close()
        }
    }
} finally {
    $listener.Close()
}
