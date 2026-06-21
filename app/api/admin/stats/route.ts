import { NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';
import { ensureSchema, getEstadisticas } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!estaAutenticado()) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }
  await ensureSchema();
  const stats = await getEstadisticas();
  return NextResponse.json({ ok: true, stats });
}
