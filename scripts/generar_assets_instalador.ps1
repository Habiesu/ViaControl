# Genera los recursos gráficos del instalador y el icono de la app en build/
# Uso: powershell -ExecutionPolicy Bypass -File scripts/generar_assets_instalador.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root  = Split-Path -Parent $PSScriptRoot
$out   = Join-Path $root 'build'
New-Item -ItemType Directory -Force $out | Out-Null

$verde      = [System.Drawing.ColorTranslator]::FromHtml('#1F6F5B')
$verdeOsc   = [System.Drawing.ColorTranslator]::FromHtml('#0B3D2E')
$menta      = [System.Drawing.ColorTranslator]::FromHtml('#6EE7B7')
$salvia     = [System.Drawing.ColorTranslator]::FromHtml('#CBEBDD')
$blanco     = [System.Drawing.Color]::White

function Nuevo-Lienzo($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.InterpolationMode = 'HighQualityBicubic'
  return @($bmp, $g)
}

# Marca: dos franjas inclinadas (paralelogramos). x,y = esquina sup. izq. de la primera franja
function Dibujar-Marca($g, [float]$x, [float]$y, [float]$alto, $c1, $c2) {
  $ancho = $alto * 0.27; $sesgo = $alto * 0.29; $sep = $ancho * 0.6
  foreach ($i in 0, 1) {
    $x0 = $x + $i * ($ancho + $sep)
    $pts = [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF ($x0 + $sesgo), $y),
      (New-Object System.Drawing.PointF ($x0 + $sesgo + $ancho), $y),
      (New-Object System.Drawing.PointF ($x0 + $ancho), ($y + $alto)),
      (New-Object System.Drawing.PointF $x0, ($y + $alto)))
    $color = if ($i -eq 0) { $c1 } else { $c2 }
    $g.FillPolygon((New-Object System.Drawing.SolidBrush $color), $pts)
  }
  return ($sesgo + 2 * $ancho + $sep)  # ancho total ocupado
}

function Rect-Redondeado([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); return $p
}

# ── Icono de la app: baldosa verde redondeada con la marca ──────────────────
function Icono-Png([int]$s) {
  $bmp, $g = Nuevo-Lienzo $s $s
  $g.Clear([System.Drawing.Color]::Transparent)
  $m = [Math]::Max(1, $s * 0.04)
  $g.FillPath((New-Object System.Drawing.SolidBrush $verde), (Rect-Redondeado $m $m ($s - 2*$m) ($s - 2*$m) ($s * 0.22)))
  $alto = $s * 0.56
  $anchoMarca = $alto * (0.29 + 0.27*2 + 0.27*0.6)
  Dibujar-Marca $g (($s - $anchoMarca) / 2) (($s - $alto) / 2) $alto $menta $blanco | Out-Null
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  if ($s -eq 256) { $bmp.Save((Join-Path $out 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $g.Dispose(); $bmp.Dispose()
  return ,$ms.ToArray()
}

# ICO con varias resoluciones (entradas PNG, válido desde Windows Vista)
$tamanos = 16, 24, 32, 48, 64, 128, 256
$pngs = foreach ($s in $tamanos) { ,(Icono-Png $s) }
$fs = [System.IO.File]::Create((Join-Path $out 'icon.ico'))
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$tamanos.Count)
$offset = 6 + 16 * $tamanos.Count
for ($i = 0; $i -lt $tamanos.Count; $i++) {
  $s = $tamanos[$i]; $len = $pngs[$i].Length
  $bw.Write([byte]($s % 256)); $bw.Write([byte]($s % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$len); $bw.Write([UInt32]$offset)
  $offset += $len
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Close()

# BMP de 24 bits (formato que exige NSIS)
function Guardar-Bmp24($bmp, $ruta) {
  $b24 = New-Object System.Drawing.Bitmap $bmp.Width, $bmp.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($b24); $g.DrawImage($bmp, 0, 0, $bmp.Width, $bmp.Height); $g.Dispose()
  $b24.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Bmp); $b24.Dispose()
}

# ── Barra lateral (bienvenida / finalizado): 164x314 ────────────────────────
$bmp, $g = Nuevo-Lienzo 164 314
$g.Clear($verde)
# franja inferior más oscura, como base
$g.FillRectangle((New-Object System.Drawing.SolidBrush $verdeOsc), 0, 250, 164, 64)
Dibujar-Marca $g 22 34 46 $menta $blanco | Out-Null
$fTitulo = New-Object System.Drawing.Font 'Segoe UI Semibold', 17, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$fSub    = New-Object System.Drawing.Font 'Segoe UI', 12, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('ViaControl', (New-Object System.Drawing.Font 'Segoe UI Semibold', 22, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $blanco), 18, 96)
$g.DrawString('Gestión de flota', $fSub, (New-Object System.Drawing.SolidBrush $salvia), 20, 128)
$g.DrawString("Viajes, gastos, saldos`ny liquidaciones`nen un solo lugar.", $fSub, (New-Object System.Drawing.SolidBrush $salvia), 20, 172)
Guardar-Bmp24 $bmp (Join-Path $out 'installerSidebar.bmp')
$g.Dispose(); $bmp.Dispose()

# ── Cabecera (páginas intermedias): 150x57, fondo blanco como la franja de NSIS ─
$bmp, $g = Nuevo-Lienzo 150 57
$g.Clear($blanco)
$anchoM = Dibujar-Marca $g 14 15 27 $verde $verdeOsc
$g.DrawString('ViaControl', (New-Object System.Drawing.Font 'Segoe UI Semibold', 17, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $verdeOsc), (14 + $anchoM + 6), 15)
Guardar-Bmp24 $bmp (Join-Path $out 'installerHeader.bmp')
$g.Dispose(); $bmp.Dispose()

Get-ChildItem $out | Select-Object Name, Length
