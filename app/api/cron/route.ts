import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { revisarTodasLasPaginas } from '@/lib/monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Seguridad: Vercel Cron manda este header automáticamente.
  // También aceptamos llamadas manuales con el secreto en el query (?secret=...)
  // para poder probarlo a mano desde el navegador.
  const authHeader = req.headers.get('authorization');
  const secretQuery = req.nextUrl.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET || '';

  const autorizado =
    authHeader === `Bearer ${cronSecret}` || (cronSecret && secretQuery === cronSecret);

  if (!autorizado) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    return NextResponse.json(
      { ok: false, error: 'Falta configurar DEEPSEEK_API_KEY en las variables de entorno' },
      { status: 500 }
    );
  }

  await ensureSchema();
  const resultado = await revisarTodasLasPaginas(deepseekKey);

  return NextResponse.json({ ok: true, ...resultado });
}
