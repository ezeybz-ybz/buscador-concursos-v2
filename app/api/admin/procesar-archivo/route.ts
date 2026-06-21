import { NextRequest, NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // subimos a 60s — 19 concursos necesita más tiempo

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
      "carrera": "carrera o resolución asociada (ej: Profesorado de Educación Inicial | Res. 4154/07)",
      "unidad_curricular": "nombre exacto de la unidad curricular o materia",
      "perfil": "perfil docente requerido según el documento",
      "inicio_inscripcion": "fecha de inicio de inscripción en formato yyyy-mm-dd, vacío si no hay",
      "cierre_inscripcion": "fecha de cierre de inscripción en formato yyyy-mm-dd, vacío si no hay",
      "dia_horario": "día y horario de clases si se informa, sino vacío",
      "modulos": "cantidad de módulos o horas si se informa (ej: 2 hs), sino vacío",
      "revista": "tipo de revista (provisional, suplente, creación, etc.) si se informa, sino vacío",
      "modalidad": "modalidad (Presencialidad Plena, Semipresencial, Virtual, PPC, etc.) si se informa, sino vacío",
      "comunicado_url": "URL del comunicado si aparece algún link, sino vacío",
      "notas": "número de resolución, número de cobertura, código de espacio, observaciones importantes"
    }
  ]
}

Reglas importantes:
- Si hay MÚLTIPLES materias o unidades curriculares, creá un objeto separado para CADA UNA.
- Datos comunes (institución, distrito, fechas de inscripción) se repiten en cada objeto.
- Si un campo no está informado, dejalo como string vacío "".
- Devolvé SIEMPRE el array "concursos", aunque sea con un solo elemento.
- NO incluyas información de comisiones evaluadoras, miembros, cronogramas ni documentación requerida.`;

// Recorta el texto en la primera sección administrativa que encuentre
function recortarTexto(texto: string): string {
  const marcas = [
    'Comisiones evaluadoras',
    'Miembros Titulares',
    'Cronograma:',
    'Procedimiento de inscripción',
    'Documentación Requerida',
    'Acceso a los formularios',
  ];
  for (const marca of marcas) {
    const idx = texto.indexOf(marca);
    if (idx > 1500) {
      return texto.slice(0, idx);
    }
  }
  return texto.slice(0, 20000);
}

// Intenta recuperar concursos parciales de un JSON cortado
function recuperarParciales(texto: string): any[] {
  const resultados: any[] = [];
  // Busca objetos JSON bien formados con al menos titulo o unidad_curricular
  const regex = /\{(?:[^{}]|\{[^{}]*\})*\}/g;
  let match;
  while ((match = regex.exec(texto)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && (obj.titulo || obj.unidad_curricular)) {
        resultados.push(obj);
      }
    } catch {}
  }
  return resultados;
}

async function llamarDeepSeek(texto: string, apiKey: string): Promise<any[]> {
  const textoRecortado = recortarTexto(texto);

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: PROMPT + '\n\nContenido del documento:\n\n' + textoRecortado,
        },
      ],
      temperature: 0,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error de DeepSeek (${res.status}): ${err.slice(0, 300)}`);
  }

  const apiData = await res.json();
  const raw = apiData.choices?.[0]?.message?.content || '';
  if (!raw) throw new Error('DeepSeek no devolvió contenido. Intentá de nuevo.');

  const clean = raw.replace(/```json|```/g, '').trim();

  // Intento 1: JSON bien formado
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.concursos) && parsed.concursos.length > 0) return parsed.concursos;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}

  // Intento 2: buscar el bloque JSON del array "concursos"
  const matchArray = clean.match(/"concursos"\s*:\s*(\[[\s\S]*?\])/);
  if (matchArray) {
    try {
      const arr = JSON.parse(matchArray[1]);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}
  }

  // Intento 3: JSON cortado — recuperar objetos completos
  const parciales = recuperarParciales(clean);
  if (parciales.length > 0) {
    return parciales;
  }

  throw new Error(
    `No se pudieron extraer concursos. El documento puede ser demasiado complejo. ` +
    `Intentá de nuevo o cargá manualmente.`
  );
}

export async function POST(req: NextRequest) {
  // Todo dentro de try/catch para que SIEMPRE devuelva JSON válido
  try {
    if (!estaAutenticado()) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'Falta DEEPSEEK_API_KEY en las variables de entorno de Vercel.' },
        { status: 500 }
      );
    }

    let texto: string | null = null;
    try {
      const formData = await req.formData();
      texto = formData.get('texto') as string | null;
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: 'Error leyendo el archivo enviado: ' + e.message },
        { status: 400 }
      );
    }

    if (!texto || texto.trim().length < 20) {
      return NextResponse.json(
        { ok: false, error: 'El documento no tiene suficiente texto para procesar.' },
        { status: 400 }
      );
    }

    const lista = await llamarDeepSeek(texto, apiKey);
    return NextResponse.json({ ok: true, lista });

  } catch (e: any) {
    // Este catch garantiza que NUNCA se devuelva una respuesta sin JSON
    return NextResponse.json(
      { ok: false, error: e.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
