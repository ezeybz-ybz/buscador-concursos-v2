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
  // Estrategia inteligente de recorte:
  // Los PDFs de convocatorias tienen la tabla de materias al principio
  // y después páginas de comisiones evaluadoras, cronogramas y documentación.
  // Solo nos interesa la primera parte con la tabla de coberturas.
  // Detectamos dónde empieza la sección administrativa para cortarla.
  const seccionesCortar = [
    'Comisiones evaluadoras',
    'Miembros Titulares',
    'Cronograma:',
    'Procedimiento de inscripción',
    'Documentación Requerida',
  ];
  let textoRecortado = texto;
  for (const marca of seccionesCortar) {
    const idx = texto.indexOf(marca);
    if (idx > 2000) { // solo si la marca aparece después de los primeros 2000 chars (evitar falsos positivos)
      textoRecortado = texto.slice(0, idx);
      break;
    }
  }
  // Limite máximo de 20000 chars para documentos muy largos
  textoRecortado = textoRecortado.slice(0, 20000);

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: PROMPT + '\n\nContenido del documento:\n\n' + textoRecortado }],
      temperature: 0,
      max_tokens: 8000,  // subimos para que alcance con 19+ concursos
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
    // Intento 1: buscar el bloque JSON completo
    const matchFull = clean.match(/\{[\s\S]*\}/);
    if (matchFull) {
      try {
        const p = JSON.parse(matchFull[0]);
        return Array.isArray(p.concursos) ? p.concursos : [p];
      } catch {}
    }

    // Intento 2: el JSON se cortó a la mitad (max_tokens alcanzado).
    // Recuperamos los objetos que sí cerraron correctamente.
    // Buscamos todos los { ... } completos dentro del array "concursos"
    const itemsCompletos: any[] = [];
    const regex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g;
    let match;
    while ((match = regex.exec(clean)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.titulo || obj.unidad_curricular) {
          itemsCompletos.push(obj);
        }
      } catch {}
    }
    if (itemsCompletos.length > 0) {
      return itemsCompletos;
    }

    throw new Error(
      `La respuesta de la IA se cortó antes de terminar (había ${
        clean.length
      } chars). Intentá de nuevo — a veces la segunda vez funciona.`
    );
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
