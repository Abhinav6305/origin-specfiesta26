import { NextRequest, NextResponse } from 'next/server'
import { getGoogleDrive } from '@/lib/googleAuth'
import { fetchEventParticipants } from '@/lib/certificateGenerator'
import { getEventByNameOrId } from '@/lib/events'
import { renderCertificatePdf } from '@/lib/templatePdfRenderer'

function safeReplaceValue(value: string | undefined) {
  return String(value ?? '').trim()
}

async function exportTemplateAsPptx(templateId: string): Promise<Buffer> {
  const drive = getGoogleDrive()
  const exportResponse = await drive.files.export(
    {
      fileId: templateId,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    {
      responseType: 'arraybuffer',
    }
  )

  return Buffer.from(exportResponse.data as ArrayBuffer)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const eventParam = searchParams.get('event') || ''
  const rollNumber = searchParams.get('roll')

  if (!eventParam || !rollNumber) {
    return NextResponse.json({ error: 'Missing event or roll' }, { status: 400 })
  }

  const event = getEventByNameOrId(eventParam)

  if (!event || !event.templateId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const result = await fetchEventParticipants(rollNumber, event)
  if (!result.found || !result.participant) {
    return NextResponse.json({ error: 'Participant not found in event' }, { status: 404 })
  }

  const values = {
    name: safeReplaceValue(result.participant.name),
    roll: safeReplaceValue(result.participant.roll || rollNumber),
    year: safeReplaceValue(result.participant.year),
    branch: safeReplaceValue(result.participant.branch),
    college: safeReplaceValue(result.participant.college),
  }

  try {
    const pdfBuffer = await renderCertificatePdf({
      eventId: event.id,
      templateId: event.templateId,
      values,
      exportTemplateAsPptx,
    })

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${event.id}-${values.roll}-specfiesta-2026.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Certificate generation error:', error)
    return NextResponse.json(
      {
        error: 'Certificate generation failed',
        message: getErrorMessage(error),
      },
      { status: 500 }
    )
  }
}
