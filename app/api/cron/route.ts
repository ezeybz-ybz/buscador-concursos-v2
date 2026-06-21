import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, limpiarConcursosVencidos } from '@/lib/db';
import { revisarTodasLasPaginas } from '@/lib/monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
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

  // 1. Limpiar concursos propios vencidos
  const borrados = await limpiarConcursosVencidos();

  // 2. Revisar páginas vigiladas y cargar nuevos
  const resultado = await revisarTodasLasPaginas(deepseekKey);

  return NextResponse.json({ ok: true, concursos_vencidos_borrados: borrados, ...resultado });
}
