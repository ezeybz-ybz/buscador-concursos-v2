import { NextRequest, NextResponse } from 'next/server';
import { verificarClave, crearSesion } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { clave } = await req.json();

  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No hay clave configurada en el servidor. Falta la variable ADMIN_PASSWORD en Vercel (Settings → Environment Variables) y hacer Redeploy.',
      },
      { status: 500 }
    );
  }

  if (!verificarClave(clave)) {
    return NextResponse.json({ ok: false, error: 'Clave incorrecta' }, { status: 401 });
  }
  crearSesion();
  return NextResponse.json({ ok: true });
}
