param(
  [Parameter(Mandatory = $true)]
  [string]$InputPptx,

  [Parameter(Mandatory = $true)]
  [string]$OutputPdf,

  [Parameter(Mandatory = $true)]
  [string]$ReplacementsJson,

  [Parameter(Mandatory = $true)]
  [string]$EventId
)

$ErrorActionPreference = 'Stop'

function ConvertTo-EscapedMap {
  param(
    [Parameter(Mandatory = $true)]
    $ReplacementData
  )

  $replacementMap = @{}

  foreach ($property in $ReplacementData.PSObject.Properties) {
    $replacementMap[$property.Name] = [string]$property.Value
  }

  return $replacementMap
}

function Set-ShapeTextFormatting {
  param(
    [Parameter(Mandatory = $true)]
    [System.Xml.XmlElement]$ShapeNode,

    [Parameter(Mandatory = $true)]
    [System.Xml.XmlNamespaceManager]$NamespaceManager,

    [Parameter(Mandatory = $true)]
    [string]$PlaceholderKey
  )

  $nonVisualProperties = $ShapeNode.SelectSingleNode('./p:nvSpPr/p:cNvPr', $NamespaceManager)
  if ($nonVisualProperties -ne $null) {
    $nonVisualProperties.SetAttribute('descr', "placeholder:$PlaceholderKey")
  }

  $bodyPrNode = $ShapeNode.SelectSingleNode('.//a:txBody/a:bodyPr', $NamespaceManager)
  if ($bodyPrNode -ne $null) {
    $bodyPrNode.SetAttribute('anchor', 'ctr')
    $bodyPrNode.SetAttribute('anchorCtr', '1')
    $bodyPrNode.SetAttribute('wrap', 'none')
    $bodyPrNode.SetAttribute('lIns', '0')
    $bodyPrNode.SetAttribute('rIns', '0')
    $bodyPrNode.SetAttribute('tIns', '0')
    $bodyPrNode.SetAttribute('bIns', '0')

    foreach ($childNode in @($bodyPrNode.ChildNodes)) {
      if ($childNode.LocalName -eq 'noAutofit' -or $childNode.LocalName -eq 'normAutofit') {
        [void]$bodyPrNode.RemoveChild($childNode)
      }
    }

    $normAutofitNode = $bodyPrNode.OwnerDocument.CreateElement('a', 'normAutofit', $NamespaceManager.LookupNamespace('a'))
    $normAutofitNode.SetAttribute('fontScale', '65000')
    $normAutofitNode.SetAttribute('lnSpcReduction', '20000')
    [void]$bodyPrNode.AppendChild($normAutofitNode)
  }

  $paragraphNodes = $ShapeNode.SelectNodes('.//a:p', $NamespaceManager)
  foreach ($paragraphNode in $paragraphNodes) {
    $paragraphProperties = $paragraphNode.SelectSingleNode('./a:pPr', $NamespaceManager)
    if ($paragraphProperties -eq $null) {
      $paragraphProperties = $paragraphNode.OwnerDocument.CreateElement('a', 'pPr', $NamespaceManager.LookupNamespace('a'))
      if ($paragraphNode.HasChildNodes) {
        [void]$paragraphNode.InsertBefore($paragraphProperties, $paragraphNode.FirstChild)
      } else {
        [void]$paragraphNode.AppendChild($paragraphProperties)
      }
    }

    $paragraphProperties.SetAttribute('algn', 'ctr')
    $paragraphProperties.SetAttribute('marL', '0')
    $paragraphProperties.SetAttribute('indent', '0')
  }
}

function Update-PptxXmlPlaceholders {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExpandedPptxDir,

    [Parameter(Mandatory = $true)]
    [hashtable]$ReplacementMap,

    [Parameter(Mandatory = $true)]
    [string]$EventId
  )

  $slideFiles = Get-ChildItem -Path (Join-Path $ExpandedPptxDir 'ppt\\slides') -Filter '*.xml'

  foreach ($file in $slideFiles) {
    $xmlDocument = New-Object System.Xml.XmlDocument
    $xmlDocument.PreserveWhitespace = $true
    $xmlDocument.Load($file.FullName)

    $namespaceManager = New-Object System.Xml.XmlNamespaceManager($xmlDocument.NameTable)
    $namespaceManager.AddNamespace('p', 'http://schemas.openxmlformats.org/presentationml/2006/main')
    $namespaceManager.AddNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')

    $shapeNodes = $xmlDocument.SelectNodes('//p:sp', $namespaceManager)
    $updated = $false

    foreach ($shapeNode in $shapeNodes) {
      $nonVisualProperties = $shapeNode.SelectSingleNode('./p:nvSpPr/p:cNvPr', $namespaceManager)
      $shapeId = if ($nonVisualProperties -ne $null) { [string]$nonVisualProperties.GetAttribute('id') } else { '' }

      if ($EventId -eq 'hack-relay' -and $shapeId) {
        $allowedShapeIds = @('60', '61', '62', '63', '64')
        if ($allowedShapeIds -notcontains $shapeId) {
          continue
        }
      }

      $textNodes = $shapeNode.SelectNodes('.//a:t', $namespaceManager)
      if ($textNodes.Count -lt 1) {
        continue
      }

      $placeholderParts = @()
      foreach ($textNode in $textNodes) {
        $placeholderParts += [string]$textNode.InnerText
      }

      $placeholder = [string]::Concat($placeholderParts)
      if (-not $ReplacementMap.ContainsKey($placeholder)) {
        continue
      }

      $textNodes[0].InnerText = [string]$ReplacementMap[$placeholder]
      for ($index = 1; $index -lt $textNodes.Count; $index++) {
        $textNodes[$index].InnerText = ''
      }

      Set-ShapeTextFormatting -ShapeNode $shapeNode -NamespaceManager $namespaceManager -PlaceholderKey $placeholder
      $updated = $true
    }

    if ($updated) {
      $xmlWriterSettings = New-Object System.Xml.XmlWriterSettings
      $xmlWriterSettings.Encoding = [System.Text.UTF8Encoding]::new($false)
      $xmlWriterSettings.Indent = $false
      $xmlWriterSettings.NewLineHandling = [System.Xml.NewLineHandling]::None
      $xmlWriter = [System.Xml.XmlWriter]::Create($file.FullName, $xmlWriterSettings)
      $xmlDocument.Save($xmlWriter)
      $xmlWriter.Close()
    }
  }
}

function Get-PlaceholderLayoutConfig {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EventId,

    [Parameter(Mandatory = $true)]
    [string]$PlaceholderKey
  )

  $defaultConfigs = @{
    'Name' = @{
      Width = 165
      Height = 22
      LeftOffset = 0
      TopOffset = 0
      Wrap = $false
      MinFontSize = 10
    }
    'Roll No' = @{
      Width = 120
      Height = 20
      LeftOffset = 0
      TopOffset = 4
      Wrap = $false
      MinFontSize = 10
    }
    'Year' = @{
      Width = 60
      Height = 20
      LeftOffset = 0
      TopOffset = 0
      Wrap = $false
      MinFontSize = 10
    }
    'Branch' = @{
      Width = 95
      Height = 20
      LeftOffset = 0
      TopOffset = 4
      Wrap = $false
      MinFontSize = 10
    }
    'College' = @{
      Width = 180
      Height = 32
      LeftOffset = 20
      TopOffset = 0
      Wrap = $true
      MinFontSize = 9
    }
  }

  $eventOverrides = @{
    'code-chaos' = @{
      'Roll No' = @{
        Width = 120
        Height = 20
        LeftOffset = 0
        TopOffset = 5
        Wrap = $false
        MinFontSize = 10
      }
      'Branch' = @{
        Width = 95
        Height = 20
        LeftOffset = 0
        TopOffset = 5
        Wrap = $false
        MinFontSize = 10
      }
      'College' = @{
        Width = 195
        Height = 34
        LeftOffset = 18
        TopOffset = 0
        Wrap = $true
        MinFontSize = 8
      }
    }
    'frame-fusion' = @{
      'Roll No' = @{
        Width = 120
        Height = 20
        LeftOffset = 0
        TopOffset = 5
        Wrap = $false
        MinFontSize = 10
      }
      'Branch' = @{
        Width = 95
        Height = 20
        LeftOffset = 0
        TopOffset = 5
        Wrap = $false
        MinFontSize = 10
      }
      'College' = @{
        Width = 195
        Height = 34
        LeftOffset = 18
        TopOffset = 0
        Wrap = $true
        MinFontSize = 8
      }
    }
    'hack-relay' = @{
      'Name' = @{
        Width = 155
        Height = 20
        LeftOffset = -8
        TopOffset = 2
        Wrap = $false
        MinFontSize = 10
      }
      'Roll No' = @{
        Width = 110
        Height = 18
        LeftOffset = -8
        TopOffset = 8
        Wrap = $false
        MinFontSize = 10
      }
      'Year' = @{
        Width = 48
        Height = 18
        LeftOffset = -2
        TopOffset = 6
        Wrap = $false
        MinFontSize = 10
      }
      'Branch' = @{
        Width = 82
        Height = 18
        LeftOffset = -4
        TopOffset = 9
        Wrap = $false
        MinFontSize = 10
      }
      'College' = @{
        Width = 205
        Height = 24
        LeftOffset = 8
        TopOffset = 7
        Wrap = $false
        MinFontSize = 9
      }
    }
  }

  $config = $defaultConfigs[$PlaceholderKey]
  if ($eventOverrides.ContainsKey($EventId) -and $eventOverrides[$EventId].ContainsKey($PlaceholderKey)) {
    $override = $eventOverrides[$EventId][$PlaceholderKey]
    foreach ($key in $override.Keys) {
      $config[$key] = $override[$key]
    }
  }

  return $config
}

function Format-PowerPointShape {
  param(
    [Parameter(Mandatory = $true)]
    $Shape,

    [Parameter(Mandatory = $true)]
    [hashtable]$LayoutConfig
  )

  try {
    if ($Shape.HasTextFrame -ne -1) {
      return
    }

    if ($Shape.TextFrame.HasText -ne -1) {
      return
    }

    $Shape.Left = [double]$Shape.Left + [double]$LayoutConfig.LeftOffset
    $Shape.Top = [double]$Shape.Top + [double]$LayoutConfig.TopOffset
    $Shape.Width = [double]$LayoutConfig.Width
    $Shape.Height = [double]$LayoutConfig.Height
    $Shape.TextFrame.MarginLeft = 0
    $Shape.TextFrame.MarginRight = 0
    $Shape.TextFrame.MarginTop = 0
    $Shape.TextFrame.MarginBottom = 0
    $wordWrapValue = if ($LayoutConfig.Wrap) { -1 } else { 0 }
    $Shape.TextFrame.WordWrap = $wordWrapValue
    $Shape.TextFrame2.WordWrap = $wordWrapValue
    $Shape.TextFrame2.VerticalAnchor = 3
    $Shape.TextFrame2.AutoSize = 0
    $Shape.TextFrame2.TextRange.ParagraphFormat.Alignment = 2
    $Shape.TextFrame.TextRange.ParagraphFormat.Alignment = 2

    $fontSize = [double]$Shape.TextFrame.TextRange.Font.Size
    if ($fontSize -le 0) {
      $fontSize = 20
      $Shape.TextFrame.TextRange.Font.Size = $fontSize
    }

    $maxWidth = [double]$Shape.Width
    $maxHeight = [double]$Shape.Height
    $minFontSize = [double]$LayoutConfig.MinFontSize

    while (
      $fontSize -gt $minFontSize -and (
        [double]$Shape.TextFrame.TextRange.BoundWidth -gt $maxWidth -or
        [double]$Shape.TextFrame.TextRange.BoundHeight -gt $maxHeight
      )
    ) {
      $fontSize = [Math]::Round($fontSize - 0.5, 1)
      $Shape.TextFrame.TextRange.Font.Size = $fontSize
    }
  } catch {
    # Ignore per-shape formatting failures and keep the rest of the export moving.
  }
}

function Apply-PowerPointFormatting {
  param(
    [Parameter(Mandatory = $true)]
    $Presentation,

    [Parameter(Mandatory = $true)]
    [hashtable]$ReplacementMap,

    [Parameter(Mandatory = $true)]
    [string]$EventId
  )

  for ($slideIndex = 1; $slideIndex -le $Presentation.Slides.Count; $slideIndex++) {
    $slide = $Presentation.Slides.Item($slideIndex)

    for ($shapeIndex = 1; $shapeIndex -le $slide.Shapes.Count; $shapeIndex++) {
      $shape = $slide.Shapes.Item($shapeIndex)

      try {
        if ($shape.HasTextFrame -ne -1 -or $shape.TextFrame.HasText -ne -1) {
          continue
        }

        $alternativeText = [string]$shape.AlternativeText
        if (-not $alternativeText.StartsWith('placeholder:')) {
          continue
        }

        $placeholderKey = $alternativeText.Substring('placeholder:'.Length)
        $layoutConfig = Get-PlaceholderLayoutConfig -EventId $EventId -PlaceholderKey $placeholderKey
        if ($null -eq $layoutConfig) {
          continue
        }

        Format-PowerPointShape -Shape $shape -LayoutConfig $layoutConfig
      } catch {
        continue
      }
    }
  }
}

$replacementData = Get-Content $ReplacementsJson -Raw | ConvertFrom-Json
$replacementMap = ConvertTo-EscapedMap -ReplacementData $replacementData
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('specfiesta-pptx-' + [System.Guid]::NewGuid().ToString('N'))
$expandedDir = Join-Path $tempRoot 'expanded'
$inputZipPath = Join-Path $tempRoot 'source.zip'
$modifiedZipPath = Join-Path $tempRoot 'modified.zip'
$modifiedPptxPath = Join-Path $tempRoot 'modified.pptx'
$powerPoint = $null
$presentation = $null

try {
  New-Item -ItemType Directory -Path $expandedDir -Force | Out-Null
  Copy-Item $InputPptx $inputZipPath -Force
  Expand-Archive -LiteralPath $inputZipPath -DestinationPath $expandedDir -Force

  Update-PptxXmlPlaceholders -ExpandedPptxDir $expandedDir -ReplacementMap $replacementMap -EventId $EventId

  Compress-Archive -Path (Join-Path $expandedDir '*') -DestinationPath $modifiedZipPath -Force
  Copy-Item $modifiedZipPath $modifiedPptxPath -Force

  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Open($modifiedPptxPath, 0, 0, 0)
  Apply-PowerPointFormatting -Presentation $presentation -ReplacementMap $replacementMap -EventId $EventId
  $presentation.SaveAs($OutputPdf, 32)
} finally {
  if ($presentation -ne $null) {
    $presentation.Close()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
  }

  if ($powerPoint -ne $null) {
    $powerPoint.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
  }

  if ([System.IO.Directory]::Exists($tempRoot)) {
    [System.IO.Directory]::Delete($tempRoot, $true)
  }

  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
