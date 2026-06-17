import { NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';
import { ensureSchema } from '@/lib/db';
import { revisarTodasLasPaginas } from '@/lib/monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  if (!estaAutenticado()) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    return NextResponse.json(
      { ok: false, error: 'Falta configurar DEEPSEEK_API_KEY en las variables de entorno de Vercel' },
      { status: 500 }
    );
  }

  await ensureSchema();
  const resultado = await revisarTodasLasPaginas(deepseekKey);

  return NextResponse.json({ ok: true, ...resultado });
}
