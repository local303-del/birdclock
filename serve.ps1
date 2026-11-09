$ErrorActionPreference='Stop'
$port=8765
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$listener=New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {$listener.Start()} catch { Write-Host 'BirdClock server is already running or port is unavailable.'; Start-Process "http://localhost:$port/"; exit }
Start-Process "http://localhost:$port/"
Write-Host 'BirdClock is running. Keep this window open. Press Ctrl+C to stop.'
$types=@{'.html'='text/html; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.webmanifest'='application/manifest+json';'.css'='text/css'}
try {while($listener.IsListening){$ctx=$listener.GetContext();$name=[Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'));if(!$name){$name='index.html'};$name=[IO.Path]::GetFileName($name);$path=Join-Path $root $name;if(Test-Path -LiteralPath $path -PathType Leaf){$bytes=[IO.File]::ReadAllBytes($path);$ext=[IO.Path]::GetExtension($path);$ctx.Response.ContentType=if($types.ContainsKey($ext)){$types[$ext]}else{'application/octet-stream'};$ctx.Response.ContentLength64=$bytes.Length;$ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)}else{$ctx.Response.StatusCode=404};$ctx.Response.Close()}}finally{$listener.Stop();$listener.Close()}
