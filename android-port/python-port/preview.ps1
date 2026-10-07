param([string]$Python, [int]$Port = 18765)
$ErrorActionPreference = 'Stop'
if (!$Python) {
    $bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $bundled) { $Python = $bundled }
    else { $Python = 'python' }
}
& $Python (Join-Path $PSScriptRoot 'app\main.py') --port $Port
if ($LASTEXITCODE -ne 0) { throw "Python preview failed: $LASTEXITCODE" }
