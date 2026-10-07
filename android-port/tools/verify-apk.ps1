param(
    [string]$Apk,
    [string]$Sdk = 'C:\Program Files (x86)\Android\android-sdk',
    [string]$Jdk = 'C:\Program Files\Android\openjdk\jdk-21.0.8'
)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$Apk) { $Apk = Join-Path $project 'dist\Tsubasa-Offline-0.2.0-alpha2.apk' }
$Apk = (Resolve-Path -LiteralPath $Apk).Path
$bt = Join-Path $Sdk 'build-tools\36.0.0'
& (Join-Path $Jdk 'bin\java.exe') -jar (Join-Path $bt 'lib\apksigner.jar') verify --verbose --print-certs $Apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
$alignment = & (Join-Path $bt 'zipalign.exe') -c -p -v 4 $Apk
if ($LASTEXITCODE -ne 0) { throw 'APK alignment verification failed' }
if (!($alignment -match 'resources\.arsc \(OK\)$')) { throw 'Android 11 requires resources.arsc uncompressed and aligned' }
$hash = (Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash
$expected = ((Get-Content -LiteralPath ($Apk+'.sha256') -Raw).Trim() -split '\s+')[0]
if ($hash -ne $expected) { throw 'APK SHA256 differs from its checksum file' }
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipFile]::OpenRead($Apk)
try {
    $names = @($zip.Entries | ForEach-Object FullName)
    foreach ($required in @('AndroidManifest.xml','classes.dex','assets/index.html','assets/js/mobile-assets.js','assets/js/plugins/Tsubasa_Mobile.js','assets/js/plugins/Tsubasa_MobileStorage.js','assets/js/plugins/Tsubasa_MobileIntro.js')) {
        if ($names -cnotcontains $required) { throw "Missing APK entry: $required" }
    }
    if (@($names | Group-Object -CaseSensitive | Where-Object Count -gt 1).Count) { throw 'Duplicate APK entries' }
    if (@($names | Where-Object { $_ -match '(^|/)(\.\.|__[^/]*|save|saves)(/|$)|\.(exe|dll|keystore)$' }).Count) { throw 'Unexpected desktop, save or development files in APK' }
    $assets = @($zip.Entries | Where-Object FullName -like 'assets/*')
    $web = Join-Path $project 'www'
    $local = @(Get-ChildItem -LiteralPath $web -Recurse -File)
    if ($assets.Count -ne $local.Count) { throw 'APK asset count differs from www' }
    # Read and hash the decompressed contents, not just ZIP directory metadata.
    foreach ($entry in $assets) {
        $relative = $entry.FullName.Substring(7)
        $file = Join-Path $web $relative
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Unexpected asset: $relative" }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $packedHash = [Convert]::ToHexString($sha.ComputeHash($stream)) }
        finally { $stream.Dispose(); $sha.Dispose() }
        if ($packedHash -ne (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash) { throw "Asset differs: $relative" }
    }
    $report = [ordered]@{
        verifiedAt = [DateTime]::UtcNow.ToString('o'); apk = $Apk
        bytes = (Get-Item -LiteralPath $Apk).Length; sha256 = $hash
        signature = 'pass'; alignment = 'pass'; assetHashes = 'pass'; assetCount = $assets.Count
        androidRuntimeTest = 'not performed'
    }
    $report | ConvertTo-Json | Set-Content -LiteralPath ($Apk+'.verification.json') -Encoding utf8
    $report | ConvertTo-Json
} finally { $zip.Dispose() }
