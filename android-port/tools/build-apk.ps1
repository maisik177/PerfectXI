param(
    [string]$Sdk = 'C:\Program Files (x86)\Android\android-sdk',
    [string]$Jdk = 'C:\Program Files\Android\openjdk\jdk-21.0.8'
)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$work = Join-Path $project 'native-build'
$dist = Join-Path $project 'dist'
$signing = Join-Path $project '.signing'
$bt = Join-Path $Sdk 'build-tools\36.0.0'
$androidJar = Join-Path $Sdk 'platforms\android-35\android.jar'
foreach ($dir in @($work,$dist,$signing,(Join-Path $work 'classes'),(Join-Path $work 'dex'))) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
function Check-Exit($label) { if ($LASTEXITCODE -ne 0) { throw "$label failed: $LASTEXITCODE" } }
# Build web assets first; failure never produces a claimed APK.
& node (Join-Path $PSScriptRoot 'build.cjs')
Check-Exit 'Web build'
& (Join-Path $Jdk 'bin\javac.exe') -encoding UTF-8 --release 8 -classpath $androidJar -d (Join-Path $work 'classes') (Join-Path $project 'native\src\pl\tsubasa\offline\preview\MainActivity.java')
Check-Exit 'Java compile'
$classes = @(Get-ChildItem (Join-Path $work 'classes') -Recurse -Filter '*.class' | ForEach-Object FullName)
& (Join-Path $Jdk 'bin\java.exe') -cp (Join-Path $bt 'lib\d8.jar') com.android.tools.r8.D8 --lib $androidJar --min-api 26 --output (Join-Path $work 'dex') @classes
Check-Exit 'DEX compile'
$base = Join-Path $work 'base.apk'
& (Join-Path $bt 'aapt2.exe') link -I $androidJar --manifest (Join-Path $project 'native\AndroidManifest.xml') -o $base
Check-Exit 'Manifest compile'
Add-Type -AssemblyName System.IO.Compression
$unsigned = Join-Path $work 'unsigned.apk'
$zipStream = [IO.File]::Open($unsigned,[IO.FileMode]::Create)
$zip = [IO.Compression.ZipArchive]::new($zipStream,[IO.Compression.ZipArchiveMode]::Create)
function Add-ZipFile([string]$file,[string]$name) {
    $entry=$zip.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
    $dst=$entry.Open(); $src=[IO.File]::OpenRead($file)
    try { $src.CopyTo($dst) } finally { $src.Dispose(); $dst.Dispose() }
}
try {
    $original=[IO.Compression.ZipFile]::OpenRead($base)
    try {
        foreach($item in $original.Entries) {
            # Android 11+ requires resources.arsc stored uncompressed and aligned.
            $compression = if ($item.FullName -eq 'resources.arsc') { [IO.Compression.CompressionLevel]::NoCompression } else { [IO.Compression.CompressionLevel]::Optimal }
            $entry=$zip.CreateEntry($item.FullName,$compression);$src=$item.Open();$dst=$entry.Open()
            try{$src.CopyTo($dst)}finally{$src.Dispose();$dst.Dispose()}
        }
    } finally { $original.Dispose() }
    Add-ZipFile (Join-Path $work 'dex\classes.dex') 'classes.dex'
    $web=Join-Path $project 'www'
    $files=@(Get-ChildItem $web -Recurse -File | Sort-Object FullName)
    $count=0
    foreach($file in $files) {
        $rel=$file.FullName.Substring($web.Length+1).Replace('\','/')
        if($rel.StartsWith('__')) { continue }
        Add-ZipFile $file.FullName ('assets/'+$rel)
        $count++
        if($count % 1000 -eq 0){Write-Output "Packed $count assets"}
    }
} finally { $zip.Dispose(); $zipStream.Dispose() }
$aligned=Join-Path $work 'aligned.apk'
& (Join-Path $bt 'zipalign.exe') -f -p 4 $unsigned $aligned
Check-Exit 'Alignment'
$key=Join-Path $signing 'alpha.keystore'
if (!(Test-Path -LiteralPath $key)) {
    & (Join-Path $Jdk 'bin\keytool.exe') -genkeypair -keystore $key -storepass android -keypass android -alias alpha -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Tsubasa Offline Local Alpha'
    Check-Exit 'Local alpha signing key'
}
$apk=Join-Path $dist 'Tsubasa-Offline-0.2.0-alpha2.apk'
& (Join-Path $Jdk 'bin\java.exe') -jar (Join-Path $bt 'lib\apksigner.jar') sign --ks $key --ks-key-alias alpha --ks-pass pass:android --key-pass pass:android --v4-signing-enabled false --out $apk $aligned
Check-Exit 'APK signing'
& (Join-Path $Jdk 'bin\java.exe') -jar (Join-Path $bt 'lib\apksigner.jar') verify --verbose --print-certs $apk
Check-Exit 'Signature verification'
& (Join-Path $bt 'zipalign.exe') -c -p 4 $apk
Check-Exit 'Alignment verification'
$hash=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash
Set-Content -LiteralPath ($apk+'.sha256') -Value ($hash+'  '+[IO.Path]::GetFileName($apk)) -Encoding ascii
Write-Output "APK: $apk"
Write-Output "SHA256: $hash"
