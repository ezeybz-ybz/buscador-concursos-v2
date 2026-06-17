import {
  getPaginasVigiladas,
  actualizarEstadoPagina,
  crearConcursoAutomaticoSiNoExiste,
  type PaginaVigilada,
} from '@/lib/db';
import { extraerConcursosConDeepSeek } from '@/lib/deepseek';

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

// ----------------------------------------------------------------
// Encuentra URLs dentro de un texto/HTML crudo.
// Prioriza dominios que suelen contener el comunicado real
// (gobierno, Google Docs/Drive), y descarta los que casi nunca
// tienen info útil (redes sociales, imágenes, Telegram interno).
// ----------------------------------------------------------------
function extraerLinksRelevantes(htmlOTexto: string, maxLinks = 5): string[] {
  const regex = /https?:\/\/[^\s"'<>]+/g;
  const encontrados = htmlOTexto.match(regex) || [];

  const descartar = [
    'telegram.org',
    't.me/s/',
    'instagram.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'whatsapp.com',
    'wa.me',
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.svg',
    '.css',
    '.js',
  ];

  const unicos = [...new Set(encontrados)]
    .map((u) => u.replace(/[),.;]+$/, '')) // saca puntuación pegada al final
    .filter((u) => !descartar.some((d) => u.toLowerCase().includes(d)));

  return unicos.slice(0, maxLinks);
}

// ----------------------------------------------------------------
// Convierte una URL de Google Docs/Drive "view" a su versión texto plano
// cuando es posible, para poder leer el contenido sin necesitar OAuth.
// ----------------------------------------------------------------
function normalizarUrlGoogle(url: string): string {
  const matchDocs = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (matchDocs) {
    return `https://docs.google.com/document/d/${matchDocs[1]}/export?format=txt`;
  }
  return url;
}

// ----------------------------------------------------------------
// Descarga una URL y devuelve su texto plano. Nunca lanza error:
// si falla, devuelve string vacío (para no frenar todo el proceso
// por un link roto).
// ----------------------------------------------------------------
async function descargarTexto(url: string): Promise<string> {
  try {
    const urlFinal = normalizarUrlGoogle(url);
    const res = await fetch(urlFinal, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConcursosBot/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return '';
    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();
    if (contentType.includes('text/html')) return htmlATexto(raw);
    return raw.slice(0, 8000);
  } catch {
    return '';
  }
}

export type ResultadoRevision = {
  pagina: string;
  ok: boolean;
  resumen?: string;
  error?: string;
};

// ----------------------------------------------------------------
// Revisa una sola página: la descarga, sigue sus links relevantes,
// junta todo el contenido y lo manda a DeepSeek para extraer concursos.
// ----------------------------------------------------------------
async function revisarPagina(
  pagina: PaginaVigilada,
  deepseekKey: string
): Promise<ResultadoRevision> {
  try {
    const res = await fetch(pagina.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConcursosBot/1.0)' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar la página`);

    const htmlPrincipal = await res.text();
    const textoPrincipal = htmlATexto(htmlPrincipal);

    // Buscamos links relevantes tanto en el HTML crudo (por si hay
    // <a href> que no aparecen en el texto visible) como en el texto plano.
    const links = extraerLinksRelevantes(htmlPrincipal + ' ' + textoPrincipal);

    const textosSecundarios = await Promise.all(links.map((l) => descargarTexto(l)));

    const contenidoCompleto = [textoPrincipal, ...textosSecundarios.filter(Boolean)].join(
      '\n\n--- CONTENIDO DE LINK RELACIONADO ---\n\n'
    );

    const concursosExtraidos = await extraerConcursosConDeepSeek(contenidoCompleto, deepseekKey);

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
        comunicado_url: c.comunicado_url || links[0] || '',
        notas: `Detectado automáticamente en ${pagina.nombre}`,
      });
      if (insertado) nuevos++;
    }

    const resumen =
      `${concursosExtraidos.length} detectados, ${nuevos} nuevos` +
      (links.length > 0 ? ` (se siguieron ${links.length} link(s))` : '');
    await actualizarEstadoPagina(pagina.id, resumen);
    return { pagina: pagina.nombre, ok: true, resumen };
  } catch (e: any) {
    const errorMsg = 'Error: ' + e.message;
    await actualizarEstadoPagina(pagina.id, errorMsg);
    return { pagina: pagina.nombre, ok: false, error: e.message };
  }
}

// ----------------------------------------------------------------
// Revisa todas las páginas activas, una por una.
// ----------------------------------------------------------------
export async function revisarTodasLasPaginas(deepseekKey: string): Promise<{
  paginas_revisadas: number;
  resultados: ResultadoRevision[];
}> {
  const paginas = await getPaginasVigiladas();
  const activas = paginas.filter((p) => p.activa);

  const resultados: ResultadoRevision[] = [];
  for (const pagina of activas) {
    resultados.push(await revisarPagina(pagina, deepseekKey));
  }

  return { paginas_revisadas: activas.length, resultados };
}
