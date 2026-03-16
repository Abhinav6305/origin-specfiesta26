import { readFile } from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

type PlaceholderKey = 'Name' | 'Roll No' | 'Year' | 'Branch' | 'College'

type BoxRect = {
  left: number
  top: number
  width: number
  height: number
}

type TemplateAssets = {
  backgroundBytes: Uint8Array
  backgroundWidth: number
  backgroundHeight: number
  slideWidth: number
  slideHeight: number
  placeholders: Record<PlaceholderKey, BoxRect>
}

type CertificateValues = {
  name: string
  roll: string
  year: string
  branch: string
  college: string
}

const EMU_PER_POINT = 12700
const A4_LANDSCAPE_WIDTH = 841.89
const A4_LANDSCAPE_HEIGHT = 595.28
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000

const placeholderOrder: PlaceholderKey[] = ['Name', 'Roll No', 'Year', 'Branch', 'College']

const templateCache = new Map<
  string,
  {
    fetchedAt: number
    assets: TemplateAssets
  }
>()

type LayoutConfig = {
  width: number
  height: number
  leftOffset: number
  topOffset: number
  minFontSize?: number
  wrap?: boolean
}

const defaultLayoutConfigs: Record<PlaceholderKey, LayoutConfig> = {
  Name: {
    width: 165,
    height: 22,
    leftOffset: 0,
    topOffset: 0,
    minFontSize: 10,
    wrap: false,
  },
  'Roll No': {
    width: 120,
    height: 20,
    leftOffset: -10,
    topOffset: 4,
    minFontSize: 10,
    wrap: false,
  },
  Year: {
    width: 60,
    height: 20,
    leftOffset: -4,
    topOffset: 0,
    minFontSize: 10,
    wrap: false,
  },
  Branch: {
    width: 95,
    height: 20,
    leftOffset: -4,
    topOffset: 4,
    minFontSize: 10,
    wrap: false,
  },
  College: {
    width: 180,
    height: 32,
    leftOffset: 20,
    topOffset: 0,
    minFontSize: 9,
    wrap: false,
  },
}

const eventLayoutOverrides: Record<string, Partial<Record<PlaceholderKey, Partial<LayoutConfig>>>> = {
  'code-chaos': {
    'Roll No': { topOffset: 5 },
    Branch: { topOffset: 5 },
    College: {
      width: 195,
      height: 34,
      leftOffset: 18,
      topOffset: 0,
      minFontSize: 8,
    },
  },
  'frame-fusion': {
    'Roll No': { topOffset: 5 },
    Branch: { topOffset: 5 },
    College: {
      width: 195,
      height: 34,
      leftOffset: 18,
      topOffset: 0,
      minFontSize: 8,
    },
  },
  'hack-relay': {
    Name: {
      width: 155,
      height: 20,
      leftOffset: -8,
      topOffset: 2,
    },
    'Roll No': {
      width: 110,
      height: 18,
      leftOffset: -8,
      topOffset: 8,
    },
    Year: {
      width: 48,
      height: 18,
      leftOffset: -2,
      topOffset: 6,
    },
    Branch: {
      width: 82,
      height: 18,
      leftOffset: -4,
      topOffset: 9,
    },
    College: {
      width: 205,
      height: 24,
      leftOffset: 8,
      topOffset: 7,
      minFontSize: 9,
    },
  },
}

function getCachedTemplate(templateId: string) {
  const cached = templateCache.get(templateId)
  if (!cached) {
    return null
  }

  if (Date.now() - cached.fetchedAt > TEMPLATE_CACHE_TTL_MS) {
    templateCache.delete(templateId)
    return null
  }

  return cached.assets
}

function toPoints(valueInEmu: number) {
  return valueInEmu / EMU_PER_POINT
}

function parseAttributes(fragment: string) {
  const attributes: Record<string, string> = {}
  for (const match of fragment.matchAll(/([a-zA-Z]+)="([^"]*)"/g)) {
    attributes[match[1]] = match[2]
  }
  return attributes
}

function readShapeText(shapeXml: string) {
  const parts = [...shapeXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) =>
    decodeXml(match[1] || '')
  )

  return parts.join('').trim()
}

function decodeXml(value: string) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function readPngDimensions(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes)
  if (buffer.length < 24) {
    throw new Error('PNG background image is too small to read dimensions')
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function parseTemplateAssetsFromPptx(pptxBuffer: Buffer) {
  return JSZip.loadAsync(pptxBuffer).then(async (zip) => {
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('string')
    const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string')
    const backgroundBytes = await zip.file('ppt/media/image1.png')?.async('uint8array')

    if (!presentationXml || !slideXml || !backgroundBytes) {
      throw new Error('Template PPTX is missing required slide assets')
    }

    const sizeFragmentMatch = presentationXml.match(/<p:sldSz([^>]*)\/>/)
    if (!sizeFragmentMatch) {
      throw new Error('Unable to read slide size from template')
    }

    const sizeAttributes = parseAttributes(sizeFragmentMatch[1])
    const slideWidth = toPoints(Number(sizeAttributes.cx))
    const slideHeight = toPoints(Number(sizeAttributes.cy))

    if (!slideWidth || !slideHeight) {
      throw new Error('Unable to read slide width and height from template')
    }

    const pngDimensions = readPngDimensions(backgroundBytes)
    const placeholders = {} as Record<PlaceholderKey, BoxRect>
    const shapeMatches = slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []

    for (const shapeXml of shapeMatches) {
      const text = readShapeText(shapeXml)
      if (!placeholderOrder.includes(text as PlaceholderKey)) {
        continue
      }

      const offsetMatch = shapeXml.match(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/)
      if (!offsetMatch) {
        continue
      }

      const shapeRect: BoxRect = {
        left: toPoints(Number(offsetMatch[1])),
        top: toPoints(Number(offsetMatch[2])),
        width: toPoints(Number(offsetMatch[3])),
        height: toPoints(Number(offsetMatch[4])),
      }

      placeholders[text as PlaceholderKey] = shapeRect
    }

    for (const placeholder of placeholderOrder) {
      if (!placeholders[placeholder]) {
        throw new Error(`Template placeholder "${placeholder}" was not found`)
      }
    }

    return {
      backgroundBytes,
      backgroundWidth: pngDimensions.width,
      backgroundHeight: pngDimensions.height,
      slideWidth,
      slideHeight,
      placeholders,
    }
  })
}

function getLayoutConfig(eventId: string, placeholder: PlaceholderKey): LayoutConfig {
  const config = {
    ...defaultLayoutConfigs[placeholder],
    ...(eventLayoutOverrides[eventId]?.[placeholder] || {}),
  }

  return config
}

function fitTextToWidth(
  text: string,
  width: number,
  height: number,
  baseSize: number,
  minFontSize: number,
  measureWidth: (size: number) => number,
  lineHeightMultiplier = 1.05
) {
  let fontSize = baseSize

  while (fontSize > minFontSize) {
    const textWidth = measureWidth(fontSize)
    const textHeight = fontSize * lineHeightMultiplier

    if (textWidth <= width && textHeight <= height) {
      break
    }

    fontSize -= 0.5
  }

  return fontSize
}

function normalizePdfValue(value: string) {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
}

export async function getTemplateAssets(
  templateId: string,
  exportTemplateAsPptx: (templateId: string) => Promise<Buffer>
) {
  const cached = getCachedTemplate(templateId)
  if (cached) {
    return cached
  }

  const pptxBuffer = await exportTemplateAsPptx(templateId)
  const assets = await parseTemplateAssetsFromPptx(pptxBuffer)

  templateCache.set(templateId, {
    fetchedAt: Date.now(),
    assets,
  })

  return assets
}

export async function renderCertificatePdf(params: {
  eventId: string
  templateId: string
  values: CertificateValues
  exportTemplateAsPptx: (templateId: string) => Promise<Buffer>
}) {
  const assets = await getTemplateAssets(params.templateId, params.exportTemplateAsPptx)
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([A4_LANDSCAPE_WIDTH, A4_LANDSCAPE_HEIGHT])
  const background = await pdfDoc.embedPng(assets.backgroundBytes)
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman)

  page.drawImage(background, {
    x: 0,
    y: 0,
    width: A4_LANDSCAPE_WIDTH,
    height: A4_LANDSCAPE_HEIGHT,
  })

  const scaleX = A4_LANDSCAPE_WIDTH / assets.slideWidth
  const scaleY = A4_LANDSCAPE_HEIGHT / assets.slideHeight

  const fieldValues: Record<PlaceholderKey, string> = {
    Name: normalizePdfValue(params.values.name),
    'Roll No': normalizePdfValue(params.values.roll),
    Year: normalizePdfValue(params.values.year),
    Branch: normalizePdfValue(params.values.branch),
    College: normalizePdfValue(params.values.college),
  }

  for (const placeholder of placeholderOrder) {
    const rawBox = assets.placeholders[placeholder]
    const layoutConfig = getLayoutConfig(params.eventId, placeholder)
    const adjustedBox = {
      left: rawBox.left + layoutConfig.leftOffset,
      top: rawBox.top + layoutConfig.topOffset,
      width: layoutConfig.width,
      height: layoutConfig.height,
    }
    const box = {
      left: adjustedBox.left * scaleX,
      top: adjustedBox.top * scaleY,
      width: adjustedBox.width * scaleX,
      height: adjustedBox.height * scaleY,
    }

    const value = fieldValues[placeholder]
    if (!value) {
      continue
    }

    const baseFontSize = Math.max(12, box.height * 0.85)
    const minFontSize = layoutConfig.minFontSize || 10
    const fontSize = fitTextToWidth(
      value,
      box.width,
      box.height,
      baseFontSize,
      minFontSize,
      (size) => font.widthOfTextAtSize(value, size)
    )

    const textWidth = font.widthOfTextAtSize(value, fontSize)
    const textHeight = font.heightAtSize(fontSize)
    const x = box.left + Math.max(0, (box.width - textWidth) / 2)
    const y =
      A4_LANDSCAPE_HEIGHT -
      box.top -
      box.height +
      Math.max(0, (box.height - textHeight) / 2)

    page.drawText(value, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    })
  }

  return Buffer.from(await pdfDoc.save())
}

export async function loadTemplateImageFromRepo(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath))
}
