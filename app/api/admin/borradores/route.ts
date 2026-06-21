import { NextRequest, NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';
import { ensureSchema, guardarBorradores, publicarBorrador } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/admin/borradores — guarda una lista de concursos como borradores
export async function POST(req: NextRequest) {
  if (!estaAutenticado()) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }
  await ensureSchema();
  const { lista } = await req.json();
  if (!Array.isArray(lista) || lista.length === 0) {
    return NextResponse.json({ ok: false, error: 'Lista vacía' }, { status: 400 });
  }
  const guardados = await guardarBorradores(lista);
  return NextResponse.json({ ok: true, guardados });
}

// PUT /api/admin/borradores?id=X — publica un borrador (lo hace visible al público)
export async function PUT(req: NextRequest) {
  if (!estaAutenticado()) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 });
  await publicarBorrador(Number(id));
  return NextResponse.json({ ok: true });
}
