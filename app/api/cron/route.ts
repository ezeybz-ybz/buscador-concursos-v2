import { NextRequest, NextResponse } from 'next/server';
import {
  ensureSchema,
  getPaginasVigiladas,
  actualizarEstadoPagina,
  crearConcursoAutomaticoSiNoExiste,
} from '@/lib/db';
import { extraerConcursosConDeepSeek } from '@/lib/deepseek';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ----------------------------------------------------------------
// Extrae texto plano simple de un HTML (sin librerías externas)
// ----------------------------------------------------------------
function htmlATexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  // Seguridad: Vercel Cron manda este header automáticamente.
  // También aceptamos llamadas manuales con el secreto en el query (?secret=...)
  // para poder probarlo a mano desde el navegador.
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
  const paginas = await getPaginasVigiladas();
  const activas = paginas.filter((p) => p.activa);

  const resultados: any[] = [];

  for (const pagina of activas) {
    try {
      const res = await fetch(pagina.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConcursosBot/1.0)' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} al descargar la página`);

      const html = await res.text();
      const texto = htmlATexto(html);

      const concursosExtraidos = await extraerConcursosConDeepSeek(texto, deepseekKey);

      let nuevos = 0;
      for (const c of concursosExtraidos) {
        const insertado = await crearConcursoAutomaticoSiNoExiste({
          titulo: c.titulo,
          campo: c.campo,
          distrito: c.distrito,
          institucion: c.institucion,
          carrera: c.carrera,
          unidad_curricular: c.unidad_curricular,
          perfil: c.perfil,
          inicio_inscripcion: c.inicio_inscripcion,
          cierre_inscripcion: c.cierre_inscripcion,
          dia_horario: c.dia_horario,
          modulos: c.modulos,
          revista: c.revista,
          modalidad: c.modalidad,
          comunicado_url: c.comunicado_url,
          notas: `Detectado automáticamente en ${pagina.nombre}`,
        });
        if (insertado) nuevos++;
      }

      const resumen = `${concursosExtraidos.length} detectados, ${nuevos} nuevos`;
      await actualizarEstadoPagina(pagina.id, resumen);
      resultados.push({ pagina: pagina.nombre, ok: true, resumen });
    } catch (e: any) {
      const errorMsg = 'Error: ' + e.message;
      await actualizarEstadoPagina(pagina.id, errorMsg);
      resultados.push({ pagina: pagina.nombre, ok: false, error: e.message });
    }
  }

  return NextResponse.json({ ok: true, paginas_revisadas: activas.length, resultados });
}
