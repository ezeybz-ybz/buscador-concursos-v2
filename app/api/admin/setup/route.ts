import { NextResponse } from 'next/server';
import { estaAutenticado } from '@/lib/auth';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

// GET /api/admin/setup — fuerza la migración de la base y muestra el estado
// Llamar una sola vez desde el navegador después de un deploy
export async function GET() {
  if (!estaAutenticado()) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const pasos: string[] = [];
  const errores: string[] = [];

  // 1. Crear tabla si no existe
  try {
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
        borrador BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    pasos.push('✅ Tabla concursos_propios OK');
  } catch (e: any) {
    errores.push('❌ Tabla concursos_propios: ' + e.message);
  }

  // 2. Agregar columna origen si no existe
  try {
    await sql`ALTER TABLE concursos_propios ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'manual';`;
    pasos.push('✅ Columna origen OK');
  } catch (e: any) {
    errores.push('❌ Columna origen: ' + e.message);
  }

  // 3. Agregar columna borrador si no existe — esta es la clave
  try {
    await sql`ALTER TABLE concursos_propios ADD COLUMN IF NOT EXISTS borrador BOOLEAN DEFAULT FALSE;`;
    pasos.push('✅ Columna borrador OK');
  } catch (e: any) {
    errores.push('❌ Columna borrador: ' + e.message);
  }

  // 4. Crear tabla paginas_vigiladas si no existe
  try {
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
    pasos.push('✅ Tabla paginas_vigiladas OK');
  } catch (e: any) {
    errores.push('❌ Tabla paginas_vigiladas: ' + e.message);
  }

  // 5. Crear tabla estadisticas si no existe
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS estadisticas (
        id SERIAL PRIMARY KEY,
        evento TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    pasos.push('✅ Tabla estadisticas OK');
  } catch (e: any) {
    errores.push('❌ Tabla estadisticas: ' + e.message);
  }

  // 6. Contar concursos y borradores actuales
  try {
    const { rows } = await sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE borrador = TRUE) AS borradores,
        COUNT(*) FILTER (WHERE borrador = FALSE) AS publicados
      FROM concursos_propios;
    `;
    const r = rows[0];
    pasos.push(`📊 Concursos: ${r.total} total (${r.publicados} publicados, ${r.borradores} borradores)`);
  } catch (e: any) {
    errores.push('❌ Conteo: ' + e.message);
  }

  return NextResponse.json({
    ok: errores.length === 0,
    pasos,
    errores,
    mensaje: errores.length === 0
      ? 'Base de datos actualizada correctamente.'
      : 'Hubo errores en la migración.',
  });
}
