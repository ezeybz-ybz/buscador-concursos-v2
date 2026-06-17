import { NextRequest, NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';
import {
  ensureSchema,
  getConcursosPropios,
  crearConcursoPropio,
  actualizarConcursoPropio,
  borrarConcursoPropio,
} from '@/lib/db';

function checkAuth() {
  return estaAutenticado();
}

export async function GET() {
  if (!checkAuth()) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  await ensureSchema();
  const concursos = await getConcursosPropios();
  return NextResponse.json({ ok: true, concursos });
}

export async function POST(req: NextRequest) {
  if (!checkAuth()) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  await ensureSchema();
  const data = await req.json();
  if (!data.titulo || !data.titulo.trim()) {
    return NextResponse.json({ ok: false, error: 'El título es obligatorio' }, { status: 400 });
  }
  await crearConcursoPropio(data);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  if (!checkAuth()) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  const data = await req.json();
  if (!data.id) return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 });
  await actualizarConcursoPropio(Number(data.id), data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth()) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'Falta id' }, { status: 400 });
  await borrarConcursoPropio(Number(id));
  return NextResponse.json({ ok: true });
}
