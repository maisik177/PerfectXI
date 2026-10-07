param(
    [string]$Source,
    [string]$Ffmpeg = 'C:\Program Files\BlueStacks_nxt\ffmpeg.exe'
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$Source) { $Source = Join-Path $root 'source-snapshot' }
$cache = Join-Path $root 'mobile-media'
New-Item -ItemType Directory -Force (Join-Path $cache 'movies') | Out-Null
$report = @()
foreach ($name in @('TsubasaOpening1.mp4','TsubasaOpening2.mp4')) {
    $inputFile = Join-Path $Source ('movies\'+$name)
    $outputFile = Join-Path $cache ('movies\'+$name)
    # OpenH264 defaults to constrained baseline; preserve the original AAC track.
    & $Ffmpeg -hide_banner -loglevel warning -y -i $inputFile -map 0:v:0 -map 0:a:0 -vf scale=1280:720 -c:v libopenh264 -b:v 2000k -pix_fmt yuv420p -threads 4 -c:a copy -movflags +faststart $outputFile
    if ($LASTEXITCODE -ne 0) { throw "Intro conversion failed: $name" }
    if ((Get-Item -LiteralPath $outputFile).Length -gt 48MB) { throw "Intro exceeds mobile memory budget: $name" }
    $report += [ordered]@{ name=$name; sourceSha256=(Get-FileHash -LiteralPath $inputFile).Hash; outputSha256=(Get-FileHash -LiteralPath $outputFile).Hash; bytes=(Get-Item -LiteralPath $outputFile).Length }
}
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $cache 'intro-manifest.json') -Encoding utf8
$report | ConvertTo-Json
