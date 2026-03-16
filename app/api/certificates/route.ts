import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateCertificatesForParticipant } from '@/lib/certificateGenerator';
import { events } from '@/lib/events';

const requestSchema = z.object({
  rollNumber: z.string().min(1, 'Roll number is required').max(20),
});

type RequestBody = z.infer<typeof requestSchema>;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    // Validate input
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { rollNumber } = validation.data;

    console.log('[v0] Processing certificate request:', {
      rollNumber,
    });

    // Generate certificates for all valid events
    const results = await generateCertificatesForParticipant(
      rollNumber,
      events.filter((e) => e.csvUrl) // Only include configured events
    );

    if (!results.found) {
      return NextResponse.json(
        {
          found: false,
          events: [],
          errors: results.errors,
          message: results.errors.length
            ? 'Unable to verify certificates for one or more events.'
            : 'Participant not found in any event.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        found: true,
        events: results.events,
        errors: results.errors,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[v0] API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
