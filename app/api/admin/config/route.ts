import { NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/admin/config
// Devuelve si la API key de DeepSeek está configurada en el servidor.
// NUNCA devuelve la key en sí, solo un booleano y un token de uso.
export async function GET() {
  if (!estaAutenticado()) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }
  const tieneKey = !!(process.env.DEEPSEEK_API_KEY?.trim());
  return NextResponse.json({ ok: true, tieneKey });
}
