// ----------------------------------------------------------------
// Helper para llamar a la API de DeepSeek y extraer concursos
// docentes de texto/HTML crudo de cualquier página.
// ----------------------------------------------------------------

export type ConcursoExtraido = {
  titulo: string;
  campo: string;
  distrito: string;
  institucion: string;
  carrera: string;
  unidad_curricular: string;
  perfil: string;
  inicio_inscripcion: string; // yyyy-mm-dd o vacío
  cierre_inscripcion: string;
  dia_horario: string;
  modulos: string;
  revista: string;
  modalidad: string;
  comunicado_url: string;
};

const SYSTEM_PROMPT = `Sos un asistente especializado en detectar concursos docentes (convocatorias para cubrir cargos o materias en instituciones educativas) publicados en páginas web de la provincia de Buenos Aires, Argentina.

Vas a recibir el contenido de texto de una página web. Tu tarea es extraer TODOS los concursos docentes que encuentres ahí.

Devolvé SOLO un JSON válido con esta estructura exacta, sin texto adicional antes o después:
{
  "concursos": [
    {
      "titulo": "nombre de la materia o cargo",
      "campo": "área o nivel educativo",
      "distrito": "distrito o partido",
      "institucion": "nombre de la institución",
      "carrera": "carrera o resolución asociada",
      "unidad_curricular": "unidad curricular específica si aplica",
      "perfil": "perfil docente requerido",
      "inicio_inscripcion": "fecha de inicio en formato yyyy-mm-dd, vacío si no hay dato",
      "cierre_inscripcion": "fecha de cierre en formato yyyy-mm-dd, vacío si no hay dato",
      "dia_horario": "día y horario si se informa, sino vacío",
      "modulos": "cantidad de módulos si se informa, sino vacío",
      "revista": "tipo de revista si se informa, sino vacío",
      "modalidad": "modalidad (presencial, virtual, etc.) si se informa, sino vacío",
      "comunicado_url": "URL del comunicado oficial si hay un link visible, sino vacío"
    }
  ]
}

Si no encontrás ningún concurso docente real en el contenido, devolvé { "concursos": [] }.
No inventes datos: si un campo no está informado, dejalo como string vacío "".
No agregues explicaciones, advertencias ni texto fuera del JSON.`;

export async function extraerConcursosConDeepSeek(
  contenidoPagina: string,
  apiKey: string
): Promise<ConcursoExtraido[]> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'Contenido de la página (puede estar truncado):\n\n' + contenidoPagina.slice(0, 12000),
        },
      ],
      temperature: 0,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const clean = raw.replace(/```json|```/g, '').trim();

  let parsed: { concursos?: ConcursoExtraido[] };
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('La respuesta de DeepSeek no fue un JSON válido: ' + clean.slice(0, 200));
  }

  return (parsed.concursos || []).filter((c) => c.titulo && c.titulo.trim());
}
