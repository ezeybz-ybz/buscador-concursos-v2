import { NextRequest, NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROMPT = `Sos un asistente especializado en concursos docentes de la provincia de Buenos Aires, Argentina.
Analizá el siguiente texto y extraé TODOS los concursos docentes que aparezcan (puede haber uno o varios).

Devolvé SOLO un JSON con esta estructura exacta, sin texto antes ni después, sin bloques de código:
{
  "concursos": [
    {
      "titulo": "nombre principal de la materia, cargo o unidad curricular",
      "campo": "campo o nivel educativo (ej: Unidades Curriculares Ed. Superior, Secundaria Técnica, Cargos)",
      "distrito": "distrito o partido (ej: Moreno, Merlo, La Matanza)",
      "institucion": "nombre completo del instituto o escuela (ej: ISFD N° 21, ISFT N° 180)",
      "carrera": "carrera o resolución asociada (ej: Profesorado de Matemática | Res. 1861/17)",
      "unidad_curricular": "nombre exacto de la unidad curricular o materia",
      "perfil": "perfil docente requerido según el documento",
      "inicio_inscripcion": "fecha de inicio de inscripción en formato yyyy-mm-dd, vacío si no hay",
      "cierre_inscripcion": "fecha de cierre de inscripción en formato yyyy-mm-dd, vacío si no hay",
      "dia_horario": "día y horario de clases si se informa, sino vacío",
      "modulos": "cantidad de módulos si se informa, sino vacío",
      "revista": "tipo de revista (provisional, suplencia, etc.) si se informa, sino vacío",
      "modalidad": "modalidad (Presencialidad Plena, Semipresencial, Virtual, etc.) si se informa, sino vacío",
      "comunicado_url": "URL del comunicado si aparece algún link, sino vacío",
      "notas": "número de resolución, código de espacio, observaciones importantes"
    }
  ]
}

Reglas importantes:
- Si hay MÚLTIPLES materias o unidades curriculares, creá un objeto separado para CADA UNA.
- Datos que son iguales para todos (institución, distrito, fechas de inscripción) se repiten en cada objeto.
- Si un campo no está informado, dejalo como string vacío "".
- Devolvé SIEMPRE el array "concursos", aunque sea con un solo elemento.`;

async function llamarDeepSeek(texto: string, apiKey: string) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: PROMPT + '\n\nContenido del documento:\n\n' + texto.slice(0, 15000) }],
      temperature: 0,
      max_tokens: 3000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
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
    throw new Error('La IA no devolvió un JSON válido. Intentá de nuevo.');
  }
}

export async function POST(req: NextRequest) {
  if (!estaAutenticado()) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'Falta configurar DEEPSEEK_API_KEY en las variables de entorno de Vercel.',
    }, { status: 500 });
  }

  const formData = await req.formData();
  const texto = formData.get('texto') as string | null;

  if (!texto || texto.trim().length < 20) {
    return NextResponse.json({
      ok: false,
      error: 'El documento no tiene suficiente texto para procesar.',
    }, { status: 400 });
  }

  const lista = await llamarDeepSeek(texto, apiKey);
  return NextResponse.json({ ok: true, lista });
}
