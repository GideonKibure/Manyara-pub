$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
$keystore = Join-Path $android 'upload-keystore.jks'
$props = Join-Path $android 'keystore.properties'

if (Test-Path $keystore) {
  Write-Host "Keystore already exists: $keystore"
  exit 0
}

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
  $javaHome = $env:JAVA_HOME
  if ($javaHome) { $keytool = Join-Path $javaHome 'bin\keytool.exe' }
}
if (-not $keytool -or ($keytool -is [string] -and -not (Test-Path $keytool))) {
  throw 'keytool not found. Install Android Studio or a JDK, then re-run this script.'
}

$password = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
$exe = if ($keytool -is [System.Management.Automation.CommandInfo]) { $keytool.Source } else { $keytool }

& $exe -genkeypair -v -keystore $keystore -alias manyara -keyalg RSA -keysize 2048 -validity 10000 -storepass $password -keypass $password -dname 'CN=Manyara Pub, OU=Manyara, O=Manyara Pub, L=Arusha, ST=Arusha, C=TZ'
@"
storeFile=upload-keystore.jks
storePassword=$password
keyAlias=manyara
keyPassword=$password
"@ | Set-Content -Path $props -Encoding ASCII

Write-Host "Created $keystore and $props. Keep both private. Play updates must use this same key."
