$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'public\logo.png'
$outDir = Join-Path $root 'src-tauri\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$source = [System.Drawing.Image]::FromFile($src)

function Save-Png([int]$size, [string]$name) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($source, 0, 0, $size, $size)
  $path = Join-Path $outDir $name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

Save-Png 32 '32x32.png'
Save-Png 128 '128x128.png'
Save-Png 256 '128x128@2x.png'
Save-Png 256 'icon.png'
Save-Png 150 'Square150x150Logo.png'
Save-Png 44 'Square44x44Logo.png'
Save-Png 50 'StoreLogo.png'

$wide = New-Object System.Drawing.Bitmap 310, 150
$wideGfx = [System.Drawing.Graphics]::FromImage($wide)
$wideGfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$wideGfx.Clear([System.Drawing.Color]::FromArgb(255, 12, 10, 9))
$wideGfx.DrawImage($source, 80, 0, 150, 150)
$wide.Save((Join-Path $outDir 'Wide310x150Logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$wideGfx.Dispose()
$wide.Dispose()

$icoPath = Join-Path $outDir 'icon.ico'
$iconBmp = New-Object System.Drawing.Bitmap 256, 256
$iconGfx = [System.Drawing.Graphics]::FromImage($iconBmp)
$iconGfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconGfx.Clear([System.Drawing.Color]::Transparent)
$iconGfx.DrawImage($source, 0, 0, 256, 256)
$handle = $iconBmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
$iconGfx.Dispose()
$iconBmp.Dispose()
$source.Dispose()

Write-Host "Wrote store icons in $outDir"
