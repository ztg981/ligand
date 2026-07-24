param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [ValidateRange(0.1, 1.0)]
  [double]$Scale = 0.875
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sourceBytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $InputPath))
if ($sourceBytes.Length -lt 6 -or
    [BitConverter]::ToUInt16($sourceBytes, 0) -ne 0 -or
    [BitConverter]::ToUInt16($sourceBytes, 2) -ne 1) {
  throw "Input is not a Windows ICO file."
}

$count = [BitConverter]::ToUInt16($sourceBytes, 4)
$entries = @()

for ($index = 0; $index -lt $count; $index++) {
  $directoryOffset = 6 + (16 * $index)
  $widthByte = $sourceBytes[$directoryOffset]
  $heightByte = $sourceBytes[$directoryOffset + 1]
  $width = if ($widthByte -eq 0) { 256 } else { [int]$widthByte }
  $height = if ($heightByte -eq 0) { 256 } else { [int]$heightByte }
  $dataLength = [BitConverter]::ToUInt32($sourceBytes, $directoryOffset + 8)
  $dataOffset = [BitConverter]::ToUInt32($sourceBytes, $directoryOffset + 12)

  $entryBytes = New-Object byte[] $dataLength
  [Array]::Copy($sourceBytes, $dataOffset, $entryBytes, 0, $dataLength)

  $inputStream = [System.IO.MemoryStream]::new($entryBytes, $false)
  $sourceImage = [System.Drawing.Image]::FromStream($inputStream)
  $canvas = [System.Drawing.Bitmap]::new(
    $width,
    $height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  $targetWidth = [single]($width * $Scale)
  $targetHeight = [single]($height * $Scale)
  $targetX = [single](($width - $targetWidth) / 2)
  $targetY = [single](($height - $targetHeight) / 2)
  $graphics.DrawImage($sourceImage, $targetX, $targetY, $targetWidth, $targetHeight)

  $outputStream = [System.IO.MemoryStream]::new()
  $canvas.Save($outputStream, [System.Drawing.Imaging.ImageFormat]::Png)
  $paddedBytes = $outputStream.ToArray()

  $outputStream.Dispose()
  $graphics.Dispose()
  $canvas.Dispose()
  $sourceImage.Dispose()
  $inputStream.Dispose()

  $entries += [PSCustomObject]@{
    WidthByte = $widthByte
    HeightByte = $heightByte
    ColorCount = $sourceBytes[$directoryOffset + 2]
    Reserved = $sourceBytes[$directoryOffset + 3]
    Planes = [BitConverter]::ToUInt16($sourceBytes, $directoryOffset + 4)
    BitsPerPixel = [BitConverter]::ToUInt16($sourceBytes, $directoryOffset + 6)
    Data = $paddedBytes
  }
}

$fileStream = [System.IO.File]::Open(
  [System.IO.Path]::GetFullPath($OutputPath),
  [System.IO.FileMode]::Create,
  [System.IO.FileAccess]::Write
)
$writer = [System.IO.BinaryWriter]::new($fileStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$entries.Count)

$nextDataOffset = 6 + (16 * $entries.Count)
foreach ($entry in $entries) {
  $writer.Write([byte]$entry.WidthByte)
  $writer.Write([byte]$entry.HeightByte)
  $writer.Write([byte]$entry.ColorCount)
  $writer.Write([byte]$entry.Reserved)
  $writer.Write([uint16]$entry.Planes)
  $writer.Write([uint16]$entry.BitsPerPixel)
  $writer.Write([uint32]$entry.Data.Length)
  $writer.Write([uint32]$nextDataOffset)
  $nextDataOffset += $entry.Data.Length
}

foreach ($entry in $entries) {
  $writer.Write([byte[]]$entry.Data)
}

$writer.Dispose()
$fileStream.Dispose()

Write-Output "Wrote padded icon: $OutputPath"
