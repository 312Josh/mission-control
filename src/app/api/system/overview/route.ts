import { NextResponse } from 'next/server';
import { buildSystemOverview } from '@/lib/system-overview';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const overview = await buildSystemOverview();
    return NextResponse.json(overview, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[system/overview] failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to build system overview',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
