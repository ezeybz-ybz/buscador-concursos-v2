import { NextResponse } from 'next/server';
import { getConcursosBrown } from '@/lib/brown';
import { getConcursosPropios, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureSchema();
    const [brown, propios] = await Promise.all([getConcursosBrown(), getConcursosPropios()]);
    const todos = [...propios, ...brown];
    return NextResponse.json({ ok: true, total: todos.length, concursos: todos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
