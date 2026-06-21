import { NextRequest, NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROMPT = `Sos un asistente especializado en concursos docentes de la provincia de Buenos Aires, Argentina.
Analizá este documento y extraé TODOS los concursos docentes (coberturas) que aparezcan en la tabla.

Devolvé SOLO un JSON con esta estructura exacta, sin texto antes ni después:
{
  "concursos": [
    {
      "titulo": "nombre de la unidad curricular o materia (ej: Juego y desarrollo infantil)",
      "campo": "Unidades Curriculares Ed. Superior",
      "distrito": "distrito o partido donde está el instituto",
      "institucion": "nombre del instituto (ej: ISFD n° 117)",
      "carrera": "carrera y resolución (ej: Profesorado de Ed. Inicial | Res. 4154/07)",
      "unidad_curricular": "igual que titulo",
      "perfil": "perfil docente requerido",
      "inicio_inscripcion": "fecha inicio inscripción en formato yyyy-mm-dd, vacío si no hay",
      "cierre_inscripcion": "fecha cierre inscripción en formato yyyy-mm-dd, vacío si no hay",
      "dia_horario": "vacío si no se informa",
      "modulos": "carga horaria (ej: 2 hs + 1 hora TAIN)",
      "revista": "situación de revista (provisional, suplente, creación, etc.)",
      "modalidad": "modalidad de cursada (Presencialidad Plena, Semipresencial, PPC, etc.)",
      "comunicado_url": "",
      "notas": "número de cobertura y cualquier dato relevante adicional"
    }
  ]
}

IMPORTANTE: 
- Cada fila de la tabla es un concurso separado. Extraé TODOS sin omitir ninguno.
- Incluí el número de cobertura en el campo "notas".
- Las fechas de inscripción aparecen en el cronograma al final del documento.
- No incluyas información de comisiones evaluadoras ni miembros.`;

export async function POST(req: NextRequest) {
  try {
    if (!estaAutenticado()) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: 'Error leyendo el archivo: ' + e.message },
        { status: 400 }
      );
    }

    const texto  = formData.get('texto')  as string | null;
    const base64 = formData.get('base64') as string | null;
    const motor  = (formData.get('motor') as string) || 'anthropic';

    if (motor === 'anthropic') {
      // Motor: Claude Haiku — ideal para tablas complejas
      const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (!anthropicKey) {
        return NextResponse.json(
          { ok: false, error: 'Falta ANTHROPIC_API_KEY en las variables de entorno de Vercel. Agregala en Settings → Environment Variables.' },
          { status: 500 }
        );
      }
      if (!base64) {
        return NextResponse.json(
          { ok: false, error: 'No se recibió el archivo para procesar con Claude.' },
          { status: 400 }
        );
      }
      const lista = await procesarConAnthropic(base64, anthropicKey);
      return NextResponse.json({ ok: true, lista, fuente: 'anthropic' });

    } else {
      // Motor: DeepSeek — texto plano
      const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
      if (!deepseekKey) {
        return NextResponse.json(
          { ok: false, error: 'Falta DEEPSEEK_API_KEY en las variables de entorno de Vercel.' },
          { status: 500 }
        );
      }
      if (!texto || texto.trim().length < 20) {
        return NextResponse.json(
          { ok: false, error: 'El documento no tiene suficiente texto. Probá con Claude en vez de DeepSeek.' },
          { status: 400 }
        );
      }
      const lista = await procesarConDeepSeek(texto, deepseekKey);
      return NextResponse.json({ ok: true, lista, fuente: 'deepseek' });
    }

  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------
// Anthropic Claude Haiku — lee el PDF como imagen, ideal para tablas
// ----------------------------------------------------------------
async function procesarConAnthropic(base64: string, apiKey: string): Promise<any[]> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text || '';
  if (!raw) throw new Error('Anthropic no devolvió contenido');

  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.concursos)) return parsed.concursos;
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const p = JSON.parse(match[0]);
        return Array.isArray(p.concursos) ? p.concursos : [p];
      } catch {}
    }
    throw new Error('JSON inválido de Anthropic');
  }
}

// ----------------------------------------------------------------
// DeepSeek — fallback con texto plano (bueno para PDFs simples)
// ----------------------------------------------------------------
function recortarTexto(texto: string): string {
  const marcas = ['Comisiones evaluadoras', 'Miembros Titulares', 'Cronograma:', 'Procedimiento de inscripción'];
  for (const marca of marcas) {
    const idx = texto.indexOf(marca);
    if (idx > 1500) return texto.slice(0, idx);
  }
  return texto.slice(0, 20000);
}

async function procesarConDeepSeek(texto: string, apiKey: string): Promise<any[]> {
  const textoRecortado = recortarTexto(texto);

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: PROMPT + '\n\nContenido del documento:\n\n' + textoRecortado }],
      temperature: 0,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  if (!raw) throw new Error('DeepSeek no devolvió contenido. Intentá de nuevo.');

  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.concursos)) return parsed.concursos;
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch {
    // Recuperar parciales
    const resultados: any[] = [];
    const regex = /\{(?:[^{}]|\{[^{}]*\})*\}/g;
    let match;
    while ((match = regex.exec(clean)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj && (obj.titulo || obj.unidad_curricular)) resultados.push(obj);
      } catch {}
    }
    if (resultados.length > 0) return resultados;
    throw new Error('No se pudieron extraer concursos del documento. Intentá de nuevo.');
  }
}
