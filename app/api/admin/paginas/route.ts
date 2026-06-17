import { NextRequest, NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';
import {
  ensureSchema,
  getPaginasVigiladas,
  crearPaginaVigilada,
  borrarPaginaVigilada,
} from '@/lib/db';

function checkAuth() {
  return estaAutenticado();
}

export async function GET() {
  if (!checkAuth()) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  await ensureSchema();
  const paginas = await getPaginasVigiladas();
  return NextResponse.json({ ok: true, paginas });
}

export async function POST(req: NextRequest) {
  if (!checkAuth()) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  await ensureSchema();
  const { nombre, url } = await req.json();
  if (!nombre?.trim() || !url?.trim()) {
    return NextResponse.json({ ok: false, error: 'Nombre y URL son obligatorios' }, { status: 400 });
  }
  await crearPaginaVigilada(nombre.trim(), url.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth()) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 });
  await borrarPaginaVigilada(Number(id));
  return NextResponse.json({ ok: true });
}
