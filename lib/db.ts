import { sql } from '@vercel/postgres';

// La integración de Neon en Vercel puede inyectar la cadena de conexión
// como DATABASE_URL en vez de POSTGRES_URL (nombre que espera @vercel/postgres).
// Este shim asegura que funcione con cualquiera de los dos nombres.
if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_UNPOOLED) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL_UNPOOLED;
}

export type Concurso = {
  id: string;
  fuente: 'brown' | 'propio';
  campo: string;
  titulo: string;
  distrito: string;
  institucion: string;
  carrera: string;
  unidad_curricular: string;
  perfil: string;
  inicio_inscripcion: string; // ISO yyyy-mm-dd o vacío
  cierre_inscripcion: string;
  dia_horario: string;
  modulos: string;
  revista: string;
  modalidad: string;
  comunicado_url: string;
  notas: string;
};

// ----------------------------------------------------------------
// Inicializar tabla (se llama una vez, o vía script de setup)
// ----------------------------------------------------------------
export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS concursos_propios (
      id SERIAL PRIMARY KEY,
      campo TEXT DEFAULT '',
      titulo TEXT NOT NULL,
      distrito TEXT DEFAULT '',
      institucion TEXT DEFAULT '',
      carrera TEXT DEFAULT '',
      unidad_curricular TEXT DEFAULT '',
      perfil TEXT DEFAULT '',
      inicio_inscripcion TEXT DEFAULT '',
      cierre_inscripcion TEXT DEFAULT '',
      dia_horario TEXT DEFAULT '',
      modulos TEXT DEFAULT '',
      revista TEXT DEFAULT '',
      modalidad TEXT DEFAULT '',
      comunicado_url TEXT DEFAULT '',
      notas TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
}

// ----------------------------------------------------------------
// Traer concursos propios (cargados desde el panel admin)
// ----------------------------------------------------------------
export async function getConcursosPropios(): Promise<Concurso[]> {
  const { rows } = await sql`
    SELECT * FROM concursos_propios ORDER BY created_at DESC;
  `;
  return rows.map((r: any) => ({
    id: 'propio-' + r.id,
    fuente: 'propio' as const,
    campo: r.campo || '',
    titulo: r.titulo || '',
    distrito: r.distrito || '',
    institucion: r.institucion || '',
    carrera: r.carrera || '',
    unidad_curricular: r.unidad_curricular || '',
    perfil: r.perfil || '',
    inicio_inscripcion: r.inicio_inscripcion || '',
    cierre_inscripcion: r.cierre_inscripcion || '',
    dia_horario: r.dia_horario || '',
    modulos: r.modulos || '',
    revista: r.revista || '',
    modalidad: r.modalidad || '',
    comunicado_url: r.comunicado_url || '',
    notas: r.notas || '',
  }));
}

export async function crearConcursoPropio(data: Partial<Concurso>) {
  await sql`
    INSERT INTO concursos_propios
      (campo, titulo, distrito, institucion, carrera, unidad_curricular, perfil,
       inicio_inscripcion, cierre_inscripcion, dia_horario, modulos, revista, modalidad,
       comunicado_url, notas)
    VALUES
      (${data.campo || ''}, ${data.titulo || ''}, ${data.distrito || ''}, ${data.institucion || ''},
       ${data.carrera || ''}, ${data.unidad_curricular || ''}, ${data.perfil || ''},
       ${data.inicio_inscripcion || ''}, ${data.cierre_inscripcion || ''}, ${data.dia_horario || ''},
       ${data.modulos || ''}, ${data.revista || ''}, ${data.modalidad || ''},
       ${data.comunicado_url || ''}, ${data.notas || ''});
  `;
}

export async function actualizarConcursoPropio(id: number, data: Partial<Concurso>) {
  await sql`
    UPDATE concursos_propios SET
      campo = ${data.campo || ''},
      titulo = ${data.titulo || ''},
      distrito = ${data.distrito || ''},
      institucion = ${data.institucion || ''},
      carrera = ${data.carrera || ''},
      unidad_curricular = ${data.unidad_curricular || ''},
      perfil = ${data.perfil || ''},
      inicio_inscripcion = ${data.inicio_inscripcion || ''},
      cierre_inscripcion = ${data.cierre_inscripcion || ''},
      dia_horario = ${data.dia_horario || ''},
      modulos = ${data.modulos || ''},
      revista = ${data.revista || ''},
      modalidad = ${data.modalidad || ''},
      comunicado_url = ${data.comunicado_url || ''},
      notas = ${data.notas || ''}
    WHERE id = ${id};
  `;
}

export async function borrarConcursoPropio(id: number) {
  await sql`DELETE FROM concursos_propios WHERE id = ${id};`;
}
