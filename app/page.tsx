'use client';

import { useEffect, useMemo, useState } from 'react';

type Concurso = {
  id: string;
  fuente: 'brown' | 'propio';
  campo: string;
  titulo: string;
  distrito: string;
  institucion: string;
  carrera: string;
  unidad_curricular: string;
  perfil: string;
  inicio_inscripcion: string;
  cierre_inscripcion: string;
  dia_horario: string;
  modulos: string;
  revista: string;
  modalidad: string;
  comunicado_url: string;
  notas: string;
};

const POR_PAGINA = 9;
const INSTAGRAM_URL = 'https://instagram.com/asesorias.profesorabuletti';
const WHATSAPP_URL = 'https://wa.me/5491138039622';

export default function HomePage() {
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [texto, setTexto] = useState('');
  const [distrito, setDistrito] = useState('');
  const [carrera, setCarrera] = useState('');
  const [vigencia, setVigencia] = useState<'vigentes' | 'todos'>('vigentes');
  const [pagina, setPagina] = useState(1);
  const [busquedaActiva, setBusquedaActiva] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const res = await fetch('/api/concursos', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error desconocido');
      setConcursos(data.concursos);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  const distritos = useMemo(
    () => [...new Set(concursos.map((c) => c.distrito).filter(Boolean))].sort(),
    [concursos]
  );
  const carreras = useMemo(
    () => [...new Set(concursos.map((c) => c.carrera).filter(Boolean))].sort(),
    [concursos]
  );

  function estaVencido(c: Concurso): boolean {
    if (!c.cierre_inscripcion) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fin = new Date(c.cierre_inscripcion + 'T23:59:59');
    return fin < hoy;
  }

  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return concursos.filter((c) => {
      if (distrito && c.distrito !== distrito) return false;
      if (carrera && c.carrera !== carrera) return false;
      if (vigencia === 'vigentes' && estaVencido(c)) return false;
      if (t) {
        const hay = (c.titulo + c.institucion + c.unidad_curricular + c.carrera).toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [concursos, texto, distrito, carrera, vigencia]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pageItems = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  function estadoConcurso(c: Concurso): { label: string; cls: string } {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ini = c.inicio_inscripcion ? new Date(c.inicio_inscripcion + 'T00:00:00') : null;
    const fin = c.cierre_inscripcion ? new Date(c.cierre_inscripcion + 'T23:59:59') : null;
    if (fin && fin < hoy) return { label: 'Cerrado', cls: 'bg-rose-50 text-rose-600 border-rose-200' };
    if (ini && ini <= hoy && (!fin || fin >= hoy))
      return { label: 'Abierto ahora', cls: 'bg-teal-50 text-teal-700 border-teal-200' };
    if (ini && ini > hoy) return { label: 'Próximo', cls: 'bg-sky-50 text-sky-600 border-sky-200' };
    return { label: 'Sin fecha informada', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  }

  function formatFecha(iso: string) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function buscar() {
    setBusquedaActiva(true);
    setPagina(1);
    setTimeout(() => {
      document.getElementById('resultados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function limpiarFiltros() {
    setTexto('');
    setDistrito('');
    setCarrera('');
    setVigencia('vigentes');
    setPagina(1);
  }

  return (
    <div className="min-h-screen pb-28">
      {/* ============ BARRA SUPERIOR ============ */}
      <nav className="bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-extrabold text-brand-700">📚 Concursos Docentes</span>
          <a
            href="/admin"
            className="text-xs font-bold text-brand-600 border-2 border-brand-200 px-4 py-2 rounded-xl hover:bg-brand-50 transition"
          >
            ⚙ Panel de administración
          </a>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <header className="bg-gradient-to-br from-brand-600 via-brand-500 to-teal-500 text-white">
        <div className="max-w-5xl mx-auto px-5 pt-14 pb-12 text-center">
          <p className="inline-block bg-white/15 text-white text-xs font-bold tracking-wide uppercase px-4 py-1.5 rounded-full mb-5">
            Actualizado en tiempo real
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">
            Encontrá tu próximo
            <br className="hidden md:block" /> concurso docente
          </h1>
          <p className="text-white/85 text-base md:text-lg max-w-2xl mx-auto">
            Buscá por distrito, carrera o título y enterate al instante de las
            convocatorias docentes vigentes en la provincia.
          </p>
          <p className="text-white/70 text-xs md:text-sm max-w-xl mx-auto mt-4">
            Una herramienta gratuita pensada para acompañar a la comunidad
            docente en cada nueva oportunidad.
          </p>
        </div>
      </header>

      {/* ============ BUSCADOR GRANDE ============ */}
      <section className="max-w-4xl mx-auto px-5 -mt-8 relative z-10">
        <div className="bg-white rounded-3xl shadow-xl shadow-brand-900/10 p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                ¿Qué estás buscando?
              </label>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscar()}
                placeholder="Materia, institución, título del concurso..."
                className="w-full border-2 border-slate-100 rounded-2xl px-5 py-4 text-base font-medium focus:outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                Distrito
              </label>
              <select
                value={distrito}
                onChange={(e) => setDistrito(e.target.value)}
                className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100 transition bg-white"
              >
                <option value="">Todos los distritos</option>
                {distritos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                Carrera
              </label>
              <select
                value={carrera}
                onChange={(e) => setCarrera(e.target.value)}
                className="w-full border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100 transition bg-white"
              >
                <option value="">Todas las carreras</option>
                {carreras.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                Mostrar
              </label>
              <div className="flex border-2 border-slate-100 rounded-2xl p-1 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setVigencia('vigentes')}
                  className={`flex-1 text-xs font-bold py-2.5 rounded-xl transition ${
                    vigencia === 'vigentes'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Solo vigentes
                </button>
                <button
                  type="button"
                  onClick={() => setVigencia('todos')}
                  className={`flex-1 text-xs font-bold py-2.5 rounded-xl transition ${
                    vigencia === 'todos'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Vigentes y vencidos
                </button>
              </div>
            </div>

            <div className="flex items-end md:col-span-3">
              <button
                onClick={buscar}
                className="w-full bg-gradient-to-r from-brand-600 to-teal-500 text-white font-bold text-base py-3.5 rounded-2xl shadow-lg shadow-brand-500/30 hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                🔍 Buscar concursos
              </button>
            </div>
          </div>

          {(texto || distrito || carrera || vigencia !== 'vigentes') && (
            <button
              onClick={limpiarFiltros}
              className="text-xs font-semibold text-slate-400 hover:text-brand-600 transition"
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {/* ============ ACCESOS RÁPIDOS ============ */}
      {!busquedaActiva && (
        <section className="max-w-4xl mx-auto px-5 mt-10">
          <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-wide mb-4">
            O explorá rápido
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => {
                limpiarFiltros();
                buscar();
              }}
              className="bg-white border-2 border-slate-100 rounded-2xl p-5 text-center hover:border-brand-300 hover:bg-brand-50 transition group"
            >
              <span className="text-2xl block mb-2">📋</span>
              <span className="text-sm font-bold text-slate-700 group-hover:text-brand-600">
                Ver todos
              </span>
            </button>
            <button
              onClick={() => {
                setTexto('');
                setCarrera('');
                buscar();
              }}
              className="bg-white border-2 border-slate-100 rounded-2xl p-5 text-center hover:border-teal-300 hover:bg-teal-50 transition group"
            >
              <span className="text-2xl block mb-2">✅</span>
              <span className="text-sm font-bold text-slate-700 group-hover:text-teal-600">
                Abiertos ahora
              </span>
            </button>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="bg-white border-2 border-slate-100 rounded-2xl p-5 text-center hover:border-teal-300 hover:bg-teal-50 transition group"
            >
              <span className="text-2xl block mb-2">💜</span>
              <span className="text-sm font-bold text-slate-700 group-hover:text-teal-700">
                Asesoramiento
              </span>
            </a>
            <button
              onClick={cargar}
              className="bg-white border-2 border-slate-100 rounded-2xl p-5 text-center hover:border-slate-300 hover:bg-slate-50 transition group"
            >
              <span className="text-2xl block mb-2">🔄</span>
              <span className="text-sm font-bold text-slate-700">Actualizar</span>
            </button>
          </div>
        </section>
      )}

      {/* ============ RESULTADOS ============ */}
      <section id="resultados" className="max-w-5xl mx-auto px-5 mt-12">
        {cargando && (
          <div className="text-center text-slate-400 py-20 text-sm">
            <div className="inline-block w-8 h-8 border-3 border-brand-200 border-t-brand-500 rounded-full animate-spin mb-3"></div>
            <p>Cargando concursos…</p>
          </div>
        )}

        {!cargando && error && (
          <div className="text-center text-rose-500 py-10 text-sm bg-rose-50 rounded-2xl border border-rose-200">
            ❌ {error}
          </div>
        )}

        {!cargando && !error && busquedaActiva && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-slate-700">
              {filtrados.length} concurso{filtrados.length !== 1 ? 's' : ''} encontrado
              {filtrados.length !== 1 ? 's' : ''}
            </h2>
          </div>
        )}

        {!cargando && !error && busquedaActiva && filtrados.length === 0 && (
          <div className="text-center text-slate-400 py-16 text-sm bg-white rounded-2xl border border-slate-100">
            No se encontraron concursos con esos filtros. Probá ampliando la búsqueda.
          </div>
        )}

        {busquedaActiva && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pageItems.map((c) => {
              const estado = estadoConcurso(c);
              const periodo =
                c.inicio_inscripcion || c.cierre_inscripcion
                  ? `${formatFecha(c.inicio_inscripcion)} al ${formatFecha(c.cierre_inscripcion)}`
                  : '';
              return (
                <div
                  key={c.id}
                  className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-bold text-slate-800 text-sm leading-snug">{c.titulo}</h3>
                  </div>
                  <span
                    className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border mb-3 ${estado.cls}`}
                  >
                    {estado.label}
                  </span>
                  <div className="space-y-1.5 text-xs text-slate-500 mb-3">
                    {c.distrito && (
                      <p>
                        <span className="font-semibold text-slate-600">📍 Distrito:</span> {c.distrito}
                      </p>
                    )}
                    {c.institucion && (
                      <p>
                        <span className="font-semibold text-slate-600">🏫 Institución:</span>{' '}
                        {c.institucion}
                      </p>
                    )}
                    {c.carrera && (
                      <p>
                        <span className="font-semibold text-slate-600">🎓 Carrera:</span> {c.carrera}
                      </p>
                    )}
                    {periodo && (
                      <p>
                        <span className="font-semibold text-slate-600">📅 Inscripción:</span> {periodo}
                      </p>
                    )}
                    {c.modalidad && (
                      <p>
                        <span className="font-semibold text-slate-600">🖥️ Modalidad:</span> {c.modalidad}
                      </p>
                    )}
                    {c.notas && <p className="italic">{c.notas}</p>}
                  </div>
                  {c.comunicado_url && (
                    <a
                      href={c.comunicado_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Ver llamado oficial →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {busquedaActiva && totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-10">
            <button
              disabled={pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
              className="px-5 py-2 text-xs font-bold rounded-xl border-2 border-slate-100 disabled:opacity-30 hover:border-brand-300"
            >
              ← Anterior
            </button>
            <span className="text-xs font-semibold text-slate-400">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              className="px-5 py-2 text-xs font-bold rounded-xl border-2 border-slate-100 disabled:opacity-30 hover:border-brand-300"
            >
              Siguiente →
            </button>
          </div>
        )}
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="max-w-5xl mx-auto px-5 mt-16 mb-6 text-center">
        <p className="text-[11px] text-slate-300">Datos actualizados automáticamente</p>
      </footer>

      {/* ============ BURBUJA FLOTANTE WHATSAPP ============ */}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Escribir por WhatsApp a Asesorías Profesora Buletti"
        className="fixed right-5 bottom-24 z-50 w-14 h-14 rounded-full bg-[#25D366] shadow-lg shadow-emerald-900/30 flex items-center justify-center text-3xl hover:scale-110 transition-transform"
      >
        <svg viewBox="0 0 32 32" className="w-8 h-8 fill-white">
          <path d="M16.001 3C9.373 3 4 8.373 4 15.001c0 2.39.704 4.613 1.916 6.482L4 29l7.738-1.9a11.93 11.93 0 0 0 4.263.776c6.628 0 12.001-5.373 12.001-12.001S22.629 3 16.001 3zm6.964 17.06c-.297.834-1.469 1.59-2.402 1.788-.62.13-1.428.234-4.146-.89-3.481-1.44-5.72-4.95-5.892-5.182-.172-.232-1.41-1.878-1.41-3.582 0-1.703.89-2.54 1.205-2.888.315-.348.688-.435.918-.435.23 0 .46.002.66.012.21.01.494-.08.772.589.297.715 1.01 2.468 1.1 2.646.09.178.15.387.03.62-.12.232-.18.376-.36.58-.18.205-.378.456-.54.612-.18.172-.368.358-.158.706.21.348.93 1.534 1.996 2.484 1.37 1.222 2.527 1.6 2.882 1.78.355.18.563.15.772-.09.21-.24.9-1.05 1.14-1.41.24-.36.48-.3.81-.18.33.12 2.1.99 2.46 1.17.36.18.6.27.69.42.09.15.09.87-.207 1.704z"/>
        </svg>
      </a>

      {/* ============ BANNER FIJO ASESORÍAS ============ */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className="block bg-gradient-to-r from-brand-600 via-brand-500 to-teal-500 text-white"
        >
          <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">💜</span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold truncate">Asesorías Profesora Buletti</p>
                <p className="text-[11px] text-white/80 truncate hidden sm:block">
                  Te ayudamos a preparar tu proyecto para el concurso
                </p>
              </div>
            </div>
            <span className="bg-white text-brand-600 text-xs font-extrabold px-4 py-2 rounded-full shrink-0 hover:bg-white/90 transition">
              Ver Instagram →
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}
