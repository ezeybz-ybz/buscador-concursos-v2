import type { Concurso } from './db';

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRyqgjE9sIIl7fEjrmVzsQo7lCc8w6Nw4EKqcbrqsT-gUDXt_YHn4tHIZJJ7eAEr9JNlJvTW16r7Fyk/pub?output=csv';

// ----------------------------------------------------------------
// Parser de CSV simple (soporta comillas con comas adentro)
// ----------------------------------------------------------------
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') {
          result.push(cur);
          cur = '';
        } else cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] || '').trim()));
    return obj;
  });
}

// ----------------------------------------------------------------
// Convertir fecha "d/m/yyyy" -> "yyyy-mm-dd" (para poder ordenar/filtrar)
// ----------------------------------------------------------------
function normalizarFecha(str: string): string {
  if (!str || !str.trim()) return '';
  const p = str.trim().split('/');
  if (p.length !== 3) return '';
  const [d, m, y] = p;
  return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ----------------------------------------------------------------
// Traer y mapear los concursos de Docentes Brown
// ----------------------------------------------------------------
export async function getConcursosBrown(): Promise<Concurso[]> {
  try {
    const res = await fetch(CSV_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = parseCSV(text);

    return rows
      .filter((r) => r['Título'] || r['Unidad Curricular'])
      .map((r, i) => ({
        id: 'brown-' + i,
        fuente: 'brown' as const,
        campo: r['Campo'] || '',
        titulo: r['Título'] || r['Unidad Curricular'] || '',
        distrito: r['Distrito'] || '',
        institucion: r['Institución'] || '',
        carrera: r['Carrera'] || '',
        unidad_curricular: r['Unidad Curricular'] || '',
        perfil: r['Campo'] || r['Título'] || '',
        inicio_inscripcion: normalizarFecha(r['Inicio de Inscripcion'] || ''),
        cierre_inscripcion: normalizarFecha(r['Cierre de Inscripcion'] || ''),
        dia_horario: r['Día y Horario'] || '',
        modulos: r['Módulos'] || '',
        revista: r['Revista'] || '',
        modalidad: r['Modalidad'] || '',
        comunicado_url: r['Comunicado'] || '',
        notas: '',
      }));
  } catch (e) {
    console.error('Error trayendo CSV de Docentes Brown:', e);
    return [];
  }
}
