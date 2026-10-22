$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

npm run cap:sync
if ($LASTEXITCODE -ne 0) { throw 'cap:sync failed' }

$android = Join-Path $root 'android'
$wrapper = Join-Path $android 'gradlew.bat'
if (-not (Test-Path $wrapper)) { throw 'Android Gradle wrapper missing. Open the project once with Android Studio.' }

$props = Join-Path $android 'keystore.properties'
if (-not (Test-Path $props)) {
  Write-Host 'No android/keystore.properties yet. Generating an upload keystore...'
  powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'create-play-keystore.ps1')
}

Push-Location $android
& .\gradlew.bat bundleRelease
$gradleExit = $LASTEXITCODE
Pop-Location
if ($gradleExit -ne 0) { throw 'bundleRelease failed. Install Android Studio SDK and a JDK, then retry.' }

$aab = Join-Path $android 'app\build\outputs\bundle\release\app-release.aab'
Write-Host "Play package: com.manyara.pub"
Write-Host "Upload this AAB in https://play.google.com/console : $aab"
Write-Host "Create the app with package name com.manyara.pub (cannot change later). Use an internal test track first."
