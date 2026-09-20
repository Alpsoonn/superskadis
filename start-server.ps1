param(
  [int]$Port = 5500
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$rootWithSeparator = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$address = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($address)

$mimeTypes = @{
  '.css' = 'text/css; charset=utf-8'
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.stl' = 'model/stl'
  '.svg' = 'image/svg+xml'
}

try {
  $listener.Start()
  Write-Host "SKADIS Creator is available at $address" -ForegroundColor Green
  Write-Host 'Press Ctrl+C to stop the server.' -ForegroundColor DarkGray
  Start-Process $address

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    try {
      $relativePath = [uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
      $relativePath = $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))

      if (-not $filePath.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
      } else {
        $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
      }
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $response.StatusCode = 500
    } finally {
      $response.Close()
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
