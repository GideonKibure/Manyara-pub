$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$cargo = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path $cargo) { $env:Path = "$cargo;$env:Path" }

if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
  throw 'Rust is not installed. Run rustup-init from https://win.rustup.rs/x86_64 then reopen PowerShell.'
}

npm run desktop:build
if ($LASTEXITCODE -ne 0) { throw 'Tauri desktop:build failed. Install Visual Studio C++ Build Tools, then retry.' }

$bundle = Join-Path $root 'src-tauri\target\release\bundle'
$nsis = Get-ChildItem -Path (Join-Path $bundle 'nsis') -Filter *.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$msi = Get-ChildItem -Path (Join-Path $bundle 'msi') -Filter *.msi -ErrorAction SilentlyContinue | Select-Object -First 1

$makeAppx = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter MakeAppx.exe -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $makeAppx) {
  Write-Host "NSIS/MSI installers (sideload): $bundle"
  if ($nsis) { Write-Host $nsis.FullName }
  if ($msi) { Write-Host $msi.FullName }
  Write-Host 'MakeAppx.exe was not found. Install the Windows SDK, then convert the MSIX in Partner Center or with MakeAppx.'
  Write-Host 'Microsoft Store: https://partner.microsoft.com/dashboard  Reserve the name Manyara Pub and upload MSIX.'
  exit 0
}

$staging = Join-Path $root 'src-tauri\target\msix-staging'
$outDir = Join-Path $bundle 'msix'
New-Item -ItemType Directory -Force -Path $staging, $outDir | Out-Null

$exe = Get-ChildItem -Path (Join-Path $root 'src-tauri\target\release') -Filter 'Manyara Pub.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) { $exe = Get-ChildItem -Path (Join-Path $root 'src-tauri\target\release') -Filter '*.exe' | Where-Object { $_.Name -notmatch 'uninstall' } | Select-Object -First 1 }
if (-not $exe) { throw 'Release exe not found after Tauri build.' }

Copy-Item $exe.FullName (Join-Path $staging 'ManyaraPub.exe') -Force
Copy-Item (Join-Path $root 'src-tauri\icons\icon.png') (Join-Path $staging 'StoreLogo.png') -Force
Copy-Item (Join-Path $root 'src-tauri\icons\Square150x150Logo.png') $staging -Force
Copy-Item (Join-Path $root 'src-tauri\icons\Square44x44Logo.png') $staging -Force
Copy-Item (Join-Path $root 'src-tauri\icons\Wide310x150Logo.png') $staging -Force

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="com.manyara.pub" Publisher="CN=ManyaraPub" Version="1.0.0.0" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>Manyara Pub</DisplayName>
    <PublisherDisplayName>Manyara Pub</PublisherDisplayName>
    <Logo>StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
  </Dependencies>
  <Applications>
    <Application Id="ManyaraPub" Executable="ManyaraPub.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="Manyara Pub" Description="Manyara Pub inventory and sales"
        BackgroundColor="transparent" Square150x150Logo="Square150x150Logo.png" Square44x44Logo="Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Wide310x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@
Set-Content -Path (Join-Path $staging 'AppxManifest.xml') -Value $manifest -Encoding UTF8

$msix = Join-Path $outDir 'ManyaraPub.msix'
& $makeAppx.FullName pack /d $staging /p $msix /o
Write-Host "MSIX: $msix"
Write-Host 'Replace Publisher CN=ManyaraPub with the Publisher ID from Partner Center before Store certification.'
Write-Host 'Upload at https://partner.microsoft.com/dashboard'
