import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, registrarEvento } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/stats  { evento: 'visita' | 'click_whatsapp' | 'click_instagram' }
export async function POST(req: NextRequest) {
  try {
    const { evento } = await req.json();
    if (!['visita', 'click_whatsapp', 'click_instagram'].includes(evento)) {
      return NextResponse.json({ ok: false, error: 'Evento inválido' }, { status: 400 });
    }
    await ensureSchema();
    await registrarEvento(evento);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Silenciosamente ignoramos errores de estadísticas para no afectar
    // la experiencia del usuario si la DB tiene algún problema.
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
