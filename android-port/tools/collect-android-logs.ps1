param(
    [Parameter(Mandatory=$true)][string]$Serial,
    [string]$Sdk = 'C:\Program Files (x86)\Android\android-sdk'
)
$ErrorActionPreference = 'Stop'
$adb = Join-Path $Sdk 'platform-tools\adb.exe'
$package = 'pl.tsubasa.offline.preview'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = Join-Path $project ('diagnostics\'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
& $adb -s $Serial get-state
if ($LASTEXITCODE -ne 0) { throw 'Selected ADB device is unavailable' }
New-Item -ItemType Directory -Path $output | Out-Null
function Capture([string]$Name, [string[]]$Arguments) {
    $result = & $adb -s $Serial @Arguments 2>&1
    $code = $LASTEXITCODE
    $result | Set-Content -LiteralPath (Join-Path $output $Name) -Encoding utf8
    if ($code -ne 0) { Write-Warning "$Name failed with code $code; see saved output" }
}
# Do not clear logcat, restart the game, or modify saved careers.
Capture 'game-logcat.txt' @('logcat','-d','-v','threadtime','TsubasaWeb:V','TsubasaAssets:V','AndroidRuntime:E','chromium:E','*:S')
Capture 'package.txt' @('shell','dumpsys','package',$package)
Capture 'memory.txt' @('shell','dumpsys','meminfo',$package)
Capture 'webview.txt' @('shell','dumpsys','webviewupdate')
Capture 'android-version.txt' @('shell','getprop','ro.build.version.release')
Write-Output "Diagnostics: $output"
