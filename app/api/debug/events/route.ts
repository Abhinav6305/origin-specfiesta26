import { NextResponse } from 'next/server';
import { events } from '@/lib/events';
import { getEventSpreadsheetStatus } from '@/lib/certificateGenerator';
import { getGoogleDrive, getGoogleServiceAccountInfo, getGoogleSlides } from '@/lib/googleAuth';

const EXPECTED_PLACEHOLDERS = ['{{Name}}', '{{Roll}}', '{{Year}}', '{{Branch}}', '{{College}}'];

function collectText(node: unknown): string[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const source = node as Record<string, unknown>;
  const values: string[] = [];

  if (typeof source.content === 'string') {
    values.push(source.content);
  }

  for (const value of Object.values(source)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        values.push(...collectText(item));
      }
      continue;
    }

    values.push(...collectText(value));
  }

  return values;
}

export async function GET() {
  try {
    const drive = getGoogleDrive();
    const slides = getGoogleSlides();
    const serviceAccount = getGoogleServiceAccountInfo();

    const results = await Promise.all(
      events.map(async (event) => {
        const spreadsheetStatus = await getEventSpreadsheetStatus(event);

        try {
          await drive.files.get({
            fileId: event.templateId,
            fields: 'id,name,mimeType',
            supportsAllDrives: true,
          });

          const presentation = await slides.presentations.get({
            presentationId: event.templateId,
          });

          const allText = collectText(presentation.data.slides || []).join(' ');
          const placeholders = EXPECTED_PLACEHOLDERS.map((placeholder) => ({
            placeholder,
            found: allText.includes(placeholder),
          }));

          return {
            eventId: event.id,
            eventName: event.name,
            spreadsheet: spreadsheetStatus,
            driveTemplateAccessible: true,
            slidesTemplateAccessible: true,
            placeholders,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            eventId: event.id,
            eventName: event.name,
            spreadsheet: spreadsheetStatus,
            driveTemplateAccessible: !message.includes('drive.googleapis.com'),
            slidesTemplateAccessible: false,
            placeholders: EXPECTED_PLACEHOLDERS.map((placeholder) => ({
              placeholder,
              found: false,
            })),
            templateError: message,
          };
        }
      })
    );

    return NextResponse.json({
      ok: true,
      serviceAccount,
      expectedPlaceholders: EXPECTED_PLACEHOLDERS,
      events: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
