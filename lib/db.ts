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

export type PaginaVigilada = {
  id: number;
  nombre: string;
  url: string;
  activa: boolean;
  ultima_revision: string | null;
  ultimo_resultado: string;
};

// ----------------------------------------------------------------
// Inicializar tablas (se llama una vez, o vía script de setup)
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
      origen TEXT DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
  // Por si la tabla ya existía de antes sin la columna origen
  await sql`ALTER TABLE concursos_propios ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'manual';`;

  await sql`
    CREATE TABLE IF NOT EXISTS paginas_vigiladas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      url TEXT NOT NULL,
      activa BOOLEAN DEFAULT TRUE,
      ultima_revision TIMESTAMP,
      ultimo_resultado TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;

  // Tabla de estadísticas: un registro por evento (visita, click WA, click IG)
  await sql`
    CREATE TABLE IF NOT EXISTS estadisticas (
      id SERIAL PRIMARY KEY,
      evento TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `;
}

// ----------------------------------------------------------------
// Estadísticas
// ----------------------------------------------------------------
export async function registrarEvento(evento: 'visita' | 'click_whatsapp' | 'click_instagram') {
  await sql`INSERT INTO estadisticas (evento) VALUES (${evento});`;
}

export async function getEstadisticas() {
  const { rows } = await sql`
    SELECT
      COUNT(*) FILTER (WHERE evento = 'visita')         AS visitas,
      COUNT(*) FILTER (WHERE evento = 'click_whatsapp') AS clicks_whatsapp,
      COUNT(*) FILTER (WHERE evento = 'click_instagram') AS clicks_instagram,
      COUNT(*) FILTER (WHERE evento = 'visita' AND created_at >= NOW() - INTERVAL '7 days')  AS visitas_7d,
      COUNT(*) FILTER (WHERE evento = 'visita' AND created_at >= NOW() - INTERVAL '30 days') AS visitas_30d
    FROM estadisticas;
  `;
  const r = rows[0] || {};
  return {
    visitas_total:      parseInt(r.visitas          || '0'),
    clicks_whatsapp:    parseInt(r.clicks_whatsapp  || '0'),
    clicks_instagram:   parseInt(r.clicks_instagram || '0'),
    visitas_7d:         parseInt(r.visitas_7d        || '0'),
    visitas_30d:        parseInt(r.visitas_30d       || '0'),
  };
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

// ----------------------------------------------------------------
// Páginas vigiladas por el monitor automático
// ----------------------------------------------------------------
export async function getPaginasVigiladas(): Promise<PaginaVigilada[]> {
  const { rows } = await sql`SELECT * FROM paginas_vigiladas ORDER BY created_at DESC;`;
  return rows.map((r: any) => ({
    id: r.id,
    nombre: r.nombre,
    url: r.url,
    activa: r.activa,
    ultima_revision: r.ultima_revision,
    ultimo_resultado: r.ultimo_resultado || '',
  }));
}

export async function crearPaginaVigilada(nombre: string, url: string) {
  await sql`INSERT INTO paginas_vigiladas (nombre, url) VALUES (${nombre}, ${url});`;
}

export async function borrarPaginaVigilada(id: number) {
  await sql`DELETE FROM paginas_vigiladas WHERE id = ${id};`;
}

export async function actualizarEstadoPagina(id: number, resultado: string) {
  await sql`
    UPDATE paginas_vigiladas
    SET ultima_revision = NOW(), ultimo_resultado = ${resultado}
    WHERE id = ${id};
  `;
}

// ----------------------------------------------------------------
// Insertar un concurso detectado automáticamente, evitando duplicados.
// Se considera duplicado si ya existe uno con mismo título + institución.
// Devuelve true si lo insertó, false si ya existía.
// ----------------------------------------------------------------
export async function crearConcursoAutomaticoSiNoExiste(
  data: Partial<Concurso>
): Promise<boolean> {
  const titulo = (data.titulo || '').trim();
  const institucion = (data.institucion || '').trim();
  if (!titulo) return false;

  const { rows } = await sql`
    SELECT id FROM concursos_propios
    WHERE LOWER(titulo) = LOWER(${titulo})
      AND LOWER(institucion) = LOWER(${institucion})
    LIMIT 1;
  `;
  if (rows.length > 0) return false;

  await sql`
    INSERT INTO concursos_propios
      (campo, titulo, distrito, institucion, carrera, unidad_curricular, perfil,
       inicio_inscripcion, cierre_inscripcion, dia_horario, modulos, revista, modalidad,
       comunicado_url, notas, origen)
    VALUES
      (${data.campo || ''}, ${titulo}, ${data.distrito || ''}, ${institucion},
       ${data.carrera || ''}, ${data.unidad_curricular || ''}, ${data.perfil || ''},
       ${data.inicio_inscripcion || ''}, ${data.cierre_inscripcion || ''}, ${data.dia_horario || ''},
       ${data.modulos || ''}, ${data.revista || ''}, ${data.modalidad || ''},
       ${data.comunicado_url || ''}, ${data.notas || ''}, 'automatico');
  `;
  return true;
}

// ----------------------------------------------------------------
// Limpiar concursos vencidos (cierre_inscripcion anterior a hoy).
// Se llama desde el cron job diario.
// Solo borra los que tienen fecha de cierre informada y ya pasó.
// Devuelve la cantidad de registros borrados.
// ----------------------------------------------------------------
export async function limpiarConcursosVencidos(): Promise<number> {
  const hoy = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
  const { rowCount } = await sql`
    DELETE FROM concursos_propios
    WHERE cierre_inscripcion != ''
      AND cierre_inscripcion IS NOT NULL
      AND cierre_inscripcion < ${hoy};
  `;
  return rowCount ?? 0;
}
