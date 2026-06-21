'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

type ConcursoForm = {
  titulo: string;
  campo: string;
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

const VACIO: ConcursoForm = {
  titulo: '', campo: '', distrito: '', institucion: '', carrera: '',
  unidad_curricular: '', perfil: '', inicio_inscripcion: '', cierre_inscripcion: '',
  dia_horario: '', modulos: '', revista: '', modalidad: '', comunicado_url: '', notas: '',
};

// ----------------------------------------------------------------
// Extrae texto de un PDF usando pdf.js (CDN)
// ----------------------------------------------------------------
async function extraerTextoPDF(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target!.result as ArrayBuffer);
        const pdfjsLib = (window as any)['pdfjs-dist/build/pdf'];
        if (!pdfjsLib) { resolve(''); return; }
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        const textos: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          textos.push(content.items.map((item: any) => item.str).join(' '));
        }
        resolve(textos.join('\n'));
      } catch { resolve(''); }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

// ----------------------------------------------------------------
// Extrae texto de un .docx usando mammoth.js (CDN)
// ----------------------------------------------------------------
async function extraerTextoWord(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const mammoth = (window as any).mammoth;
        if (!mammoth) { resolve(''); return; }
        const result = await mammoth.extractRawText({
          arrayBuffer: e.target!.result as ArrayBuffer,
        });
        resolve(result.value || '');
      } catch { resolve(''); }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

// ----------------------------------------------------------------
// Convierte a base64 (fallback para PDFs sin texto extraíble / scans)
// ----------------------------------------------------------------
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

// ----------------------------------------------------------------
// Envía el texto al servidor → DeepSeek devuelve UNA LISTA de concursos
// (la key vive solo en Vercel, nunca sale al browser)
// ----------------------------------------------------------------
async function procesarEnServidor(texto: string): Promise<Partial<ConcursoForm>[]> {
  const form = new FormData();
  form.append('texto', texto);
  const res = await fetch('/api/admin/procesar-archivo', { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Error del servidor');
  // El servidor devuelve { lista: [...] } o { datos: {...} } (retrocompatible)
  if (Array.isArray(data.lista)) return data.lista;
  if (data.datos) return [data.datos];
  return [];
}

// ----------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ----------------------------------------------------------------
export default function AdminPage() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [clave, setClave] = useState('');
  const [errorLogin, setErrorLogin] = useState('');

  // Lista de concursos
  const [lista, setLista] = useState<any[]>([]);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  // Formulario de carga/edición
  const [form, setForm] = useState<ConcursoForm>(VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msgForm, setMsgForm] = useState('');

  // PDF / Word con IA
  const [leyendoArchivo, setLeyendoArchivo] = useState(false);
  const [msgArchivo, setMsgArchivo] = useState('');
  const [listaPDF, setListaPDF] = useState<Partial<ConcursoForm>[]>([]);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Monitoreo automático
  const [paginas, setPaginas] = useState<any[]>([]);
  const [nuevaPaginaNombre, setNuevaPaginaNombre] = useState('');
  const [nuevaPaginaUrl, setNuevaPaginaUrl] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [msgRevision, setMsgRevision] = useState('');

  // Vista activa en la lista (para poder ir directo a editar)
  const [vistaActiva, setVistaActiva] = useState<'lista' | 'monitoreo'>('lista');

  // Estadísticas
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    verificarAuth();
    // Cargar pdf.js para leer PDFs
    const scriptPDF = document.createElement('script');
    scriptPDF.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    scriptPDF.async = true;
    document.head.appendChild(scriptPDF);
    // Cargar mammoth.js para leer archivos Word (.docx)
    const scriptWord = document.createElement('script');
    scriptWord.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    scriptWord.async = true;
    document.head.appendChild(scriptWord);
  }, []);

  async function verificarAuth() {
    const res = await fetch('/api/admin/concursos');
    if (res.status === 401) {
      setAutenticado(false);
    } else {
      setAutenticado(true);
      const data = await res.json();
      setLista(data.concursos || []);
      cargarPaginas();
      cargarStats();
    }
  }

  async function cargarStats() {
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.ok) setStats(data.stats);
    } catch {}
  }

  async function login() {
    setErrorLogin('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave }),
    });
    const data = await res.json();
    if (!data.ok) { setErrorLogin(data.error || 'Clave incorrecta'); return; }
    setAutenticado(true);
    cargarLista();
    cargarPaginas();
  }

  async function cargarLista() {
    const res = await fetch('/api/admin/concursos');
    const data = await res.json();
    setLista(data.concursos || []);
  }

  async function cargarPaginas() {
    const res = await fetch('/api/admin/paginas');
    const data = await res.json();
    setPaginas(data.paginas || []);
  }

  // ----------------------------------------------------------------
  // SUBIR ARCHIVO (PDF o Word) → extrae texto → IA → lista de concursos
  // ----------------------------------------------------------------
  async function procesarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const esWord = file.name.endsWith('.docx') || file.name.endsWith('.doc');
    const esPDF  = file.name.endsWith('.pdf');

    if (!esWord && !esPDF) {
      setMsgArchivo('❌ Formato no soportado. Subí un archivo PDF o Word (.docx).');
      return;
    }

    setLeyendoArchivo(true);
    setListaPDF([]);
    setMsgArchivo(`⏳ Leyendo ${esWord ? 'Word' : 'PDF'}...`);

    try {
      let texto = '';

      if (esWord) {
        texto = await extraerTextoWord(file);
        if (!texto.trim()) throw new Error('No se pudo extraer texto del archivo Word.');
      } else {
        texto = await extraerTextoPDF(file);
        if (!texto.trim()) {
          setMsgArchivo('⏳ PDF sin texto extraíble, procesando como imagen...');
          const base64 = await fileToBase64(file);
          const formData = new FormData();
          formData.append('texto', `[PDF escaneado: ${file.name}]`);
          formData.append('base64', base64);
          const res = await fetch('/api/admin/procesar-archivo', { method: 'POST', body: formData });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error);
          const lista = Array.isArray(data.lista) ? data.lista : [data.datos];
          setListaPDF(lista);
          setMsgArchivo(`✅ ${lista.length} concurso(s) detectado(s). Hacé clic en "Cargar" para pasarlo al formulario.`);
          return;
        }
      }

      setMsgArchivo('⏳ Analizando con IA...');
      const lista = await procesarEnServidor(texto);
      setListaPDF(lista);
      if (lista.length === 1) {
        aplicarDatos(lista[0]);
        setMsgArchivo('✅ Concurso cargado en el formulario. Revisá y guardá.');
      } else if (lista.length > 1) {
        setMsgArchivo(`✅ ${lista.length} concursos detectados en el archivo. Elegí cuál cargar.`);
      } else {
        setMsgArchivo('⚠️ No se detectaron concursos en el archivo.');
      }
    } catch (err: any) {
      setMsgArchivo('❌ ' + err.message);
    } finally {
      setLeyendoArchivo(false);
      if (inputFileRef.current) inputFileRef.current.value = '';
    }
  }

  // Limpia el form COMPLETAMENTE antes de aplicar datos nuevos (cambio 3)
  function aplicarDatos(datos: Partial<ConcursoForm>) {
    const nuevo = { ...VACIO };
    for (const key of Object.keys(VACIO) as (keyof ConcursoForm)[]) {
      if (datos[key] !== undefined && datos[key] !== null) {
        nuevo[key] = String(datos[key]);
      }
    }
    setForm(nuevo);
    setEditandoId(null);
  }

  function cargarDesdeLista(idx: number) {
    aplicarDatos(listaPDF[idx]);
    setListaPDF([]);
    setMsgArchivo('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ----------------------------------------------------------------
  // FORMULARIO
  // ----------------------------------------------------------------
  function actualizarCampo(campo: keyof ConcursoForm, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  function nuevoFormulario() {
    setForm(VACIO);
    setEditandoId(null);
    setMsgForm('');
    setMsgArchivo('');
  }

  function editar(item: any) {
    setForm({
      titulo: item.titulo || '', campo: item.campo || '', distrito: item.distrito || '',
      institucion: item.institucion || '', carrera: item.carrera || '',
      unidad_curricular: item.unidad_curricular || '', perfil: item.perfil || '',
      inicio_inscripcion: item.inicio_inscripcion || '', cierre_inscripcion: item.cierre_inscripcion || '',
      dia_horario: item.dia_horario || '', modulos: item.modulos || '', revista: item.revista || '',
      modalidad: item.modalidad || '', comunicado_url: item.comunicado_url || '', notas: item.notas || '',
    });
    setEditandoId(parseInt(String(item.id).replace('propio-', '')));
    setMsgForm('');
    setMsgArchivo('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardar() {
    if (!form.titulo.trim()) { setMsgForm('❌ El título es obligatorio'); return; }
    setGuardando(true); setMsgForm('');
    try {
      if (editandoId) {
        await fetch('/api/admin/concursos', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, id: editandoId }),
        });
        setMsgForm('✅ Concurso actualizado correctamente');
      } else {
        await fetch('/api/admin/concursos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        setMsgForm('✅ Concurso guardado correctamente');
      }
      nuevoFormulario();
      cargarLista();
    } catch (e: any) {
      setMsgForm('❌ ' + e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(item: any) {
    if (!confirm(`¿Borrar "${item.titulo}"? Esta acción no se puede deshacer.`)) return;
    const id = String(item.id).replace('propio-', '');
    await fetch('/api/admin/concursos?id=' + id, { method: 'DELETE' });
    cargarLista();
  }

  // ----------------------------------------------------------------
  // MONITOREO
  // ----------------------------------------------------------------
  async function agregarPagina() {
    if (!nuevaPaginaNombre.trim() || !nuevaPaginaUrl.trim()) {
      setMsgRevision('❌ Completá nombre y URL'); return;
    }
    await fetch('/api/admin/paginas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevaPaginaNombre, url: nuevaPaginaUrl }),
    });
    setNuevaPaginaNombre(''); setNuevaPaginaUrl('');
    setMsgRevision('✅ Página agregada');
    cargarPaginas();
  }

  async function borrarPagina(id: number) {
    if (!confirm('¿Dejar de vigilar esta página?')) return;
    await fetch('/api/admin/paginas?id=' + id, { method: 'DELETE' });
    cargarPaginas();
  }

  async function revisarAhora() {
    setRevisando(true);
    setMsgRevision('⏳ Revisando páginas con IA, puede tardar un minuto...');
    try {
      const res = await fetch('/api/admin/revisar-ahora', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        setMsgRevision('❌ ' + (data.error || 'Error desconocido'));
      } else if (data.paginas_revisadas === 0) {
        setMsgRevision('⚠️ No hay páginas activas. Agregá alguna en la sección de abajo.');
      } else {
        const totalNuevos = data.resultados.reduce((acc: number, r: any) => {
          const match = r.resumen?.match(/(\d+) nuevos/);
          return acc + (match ? parseInt(match[1]) : 0);
        }, 0);
        setMsgRevision(`✅ ${data.paginas_revisadas} página(s) revisadas — ${totalNuevos} concurso(s) nuevo(s) cargados`);
        cargarLista(); cargarPaginas();
      }
    } catch (e: any) {
      setMsgRevision('❌ Error: ' + e.message);
    } finally {
      setRevisando(false);
    }
  }

  // ----------------------------------------------------------------
  // LISTA FILTRADA
  // ----------------------------------------------------------------
  const listaFiltrada = useMemo(() => {
    const t = filtroBusqueda.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(item =>
      (item.titulo || '').toLowerCase().includes(t) ||
      (item.institucion || '').toLowerCase().includes(t) ||
      (item.distrito || '').toLowerCase().includes(t) ||
      (item.carrera || '').toLowerCase().includes(t)
    );
  }, [lista, filtroBusqueda]);

  // ================================================================
  // RENDER: LOGIN
  // ================================================================
  if (autenticado === null) {
    return <div className="text-center py-20 text-slate-400 text-sm">Verificando acceso…</div>;
  }

  if (!autenticado) {
    return (
      <main className="max-w-sm mx-auto px-4 py-24">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h1 className="text-lg font-bold text-center mb-2">🔐 Panel de administración</h1>
          <p className="text-xs text-slate-400 text-center mb-5">Solo vos podés entrar acá</p>
          <input type="password" placeholder="Tu clave de acceso" value={clave}
            onChange={e => setClave(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()}
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          {errorLogin && <p className="text-xs text-red-500 mb-3 text-center">{errorLogin}</p>}
          <button onClick={login}
            className="w-full bg-brand-600 text-white font-bold text-sm py-2.5 rounded-lg hover:bg-brand-700">
            Entrar al panel
          </button>
        </div>
      </main>
    );
  }

  // ================================================================
  // RENDER: PANEL ADMIN
  // ================================================================
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-800">🛠️ Panel de administración</h1>
        <span className="text-xs text-slate-400">{lista.length} concursos cargados</span>
      </div>

      {/* ============================================================
          SECCIÓN 0: ESTADÍSTICAS
      ============================================================ */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-slate-800">📊 Estadísticas</h2>
          <button onClick={cargarStats} className="text-xs text-slate-400 hover:text-brand-600 transition">
            🔄 Actualizar
          </button>
        </div>
        {stats ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Visitas totales" valor={stats.visitas_total} icono="👁" color="brand" />
              <StatCard label="Últimos 30 días" valor={stats.visitas_30d} icono="📅" color="teal" />
              <StatCard label="Clicks WhatsApp" valor={stats.clicks_whatsapp} icono="💬" color="green" />
              <StatCard label="Clicks Instagram" valor={stats.clicks_instagram} icono="💜" color="pink" />
            </div>
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-500">
              <span className="font-semibold">Última semana:</span> {stats.visitas_7d} visita(s) ·
              <span className="ml-2">Conversión WA: {stats.visitas_total > 0
                ? Math.round((stats.clicks_whatsapp / stats.visitas_total) * 100)
                : 0}%</span> ·
              <span className="ml-2">Conversión IG: {stats.visitas_total > 0
                ? Math.round((stats.clicks_instagram / stats.visitas_total) * 100)
                : 0}%</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">Cargando estadísticas…</p>
        )}
      </section>

      {/* ============================================================
          SECCIÓN 1: FORMULARIO DE CARGA / EDICIÓN
      ============================================================ */}
      <section className="bg-white border-2 border-brand-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-brand-700">
            {editandoId ? '✏️ Editando concurso' : '➕ Cargar nuevo concurso'}
          </h2>
          {editandoId && (
            <button onClick={nuevoFormulario}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
              ← Cancelar / Nuevo
            </button>
          )}
        </div>

        {editandoId && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
            <p className="text-xs font-bold text-amber-700">
              ✏️ Modo edición activo — estás modificando un concurso existente
            </p>
            <p className="text-[11px] text-amber-600">Hacé los cambios y tocá "Guardar cambios" abajo.</p>
          </div>
        )}

        {/* Archivo con IA — PDF o Word, sin necesidad de ingresar key */}
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-extrabold text-brand-700 mb-1">
            🤖 Auto-completar con IA desde PDF o Word
          </p>
          <p className="text-[11px] text-brand-500 mb-3">
            Subí el comunicado del llamado y la IA detecta todos los concursos del archivo.
            Si hay varios, elegís cuál cargar al formulario.
          </p>
          <label className={`flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-dashed text-xs font-bold cursor-pointer transition
            ${leyendoArchivo
              ? 'border-brand-200 text-brand-300 cursor-not-allowed bg-white'
              : 'border-brand-500 text-brand-600 hover:bg-brand-100'}`}>
            {leyendoArchivo
              ? '⏳ ' + (msgArchivo || 'Procesando...')
              : '📄 Hacé clic acá para subir el PDF o Word del llamado'}
            <input
              ref={inputFileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={procesarArchivo}
              disabled={leyendoArchivo}
            />
          </label>

          {msgArchivo && !leyendoArchivo && (
            <p className={`text-xs mt-2 font-medium ${
              msgArchivo.startsWith('✅') ? 'text-brand-700' :
              msgArchivo.startsWith('❌') ? 'text-red-600' : 'text-amber-600'
            }`}>
              {msgArchivo}
            </p>
          )}

          {/* Lista de concursos detectados en el archivo */}
          {listaPDF.length > 1 && (
            <div className="mt-3 space-y-2">
              {listaPDF.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 bg-white border border-brand-200 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {c.titulo || c.unidad_curricular || `Concurso ${i + 1}`}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {[c.institucion, c.distrito].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    onClick={() => cargarDesdeLista(i)}
                    className="text-xs font-bold px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 shrink-0"
                  >
                    Cargar →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campos del formulario */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <Campo label="Título *" value={form.titulo} onChange={v => actualizarCampo('titulo', v)} />
          <Campo label="Campo / Perfil" value={form.campo} onChange={v => actualizarCampo('campo', v)} />
          <Campo label="Distrito" value={form.distrito} onChange={v => actualizarCampo('distrito', v)} />
          <Campo label="Institución" value={form.institucion} onChange={v => actualizarCampo('institucion', v)} />
          <Campo label="Carrera" value={form.carrera} onChange={v => actualizarCampo('carrera', v)} />
          <Campo label="Unidad curricular / Materia" value={form.unidad_curricular} onChange={v => actualizarCampo('unidad_curricular', v)} />
          <Campo label="Inicio inscripción" type="date" value={form.inicio_inscripcion} onChange={v => actualizarCampo('inicio_inscripcion', v)} />
          <Campo label="Cierre inscripción" type="date" value={form.cierre_inscripcion} onChange={v => actualizarCampo('cierre_inscripcion', v)} />
          <Campo label="Día y horario" value={form.dia_horario} onChange={v => actualizarCampo('dia_horario', v)} />
          <Campo label="Módulos" value={form.modulos} onChange={v => actualizarCampo('modulos', v)} />
          <Campo label="Revista" value={form.revista} onChange={v => actualizarCampo('revista', v)} />
          <Campo label="Modalidad" value={form.modalidad} onChange={v => actualizarCampo('modalidad', v)} />
          <div className="md:col-span-2">
            <Campo label="Link al comunicado" value={form.comunicado_url} onChange={v => actualizarCampo('comunicado_url', v)} />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Notas adicionales</label>
          <textarea value={form.notas} onChange={e => actualizarCampo('notas', e.target.value)} rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>

        {msgForm && (
          <p className={`text-sm font-semibold mb-3 ${msgForm.startsWith('✅') ? 'text-brand-700' : 'text-red-600'}`}>
            {msgForm}
          </p>
        )}

        <button onClick={guardar} disabled={guardando}
          className="w-full bg-brand-600 text-white font-bold text-sm py-3 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition">
          {guardando ? 'Guardando…' : editandoId ? '💾 Guardar cambios' : '💾 Guardar concurso'}
        </button>
      </section>

      {/* ============================================================
          SECCIÓN 2: LISTA DE CONCURSOS CON BUSCADOR Y EDICIÓN
      ============================================================ */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-800 mb-1">📋 Mis concursos cargados</h2>
        <p className="text-xs text-slate-400 mb-4">
          Hacé clic en <strong>Editar</strong> para modificar cualquier dato incorrecto, o en <strong>Borrar</strong> para eliminarlo.
        </p>

        <div className="flex gap-2 mb-4">
          <input type="text" placeholder="Buscar por título, institución, distrito o carrera..."
            value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          {filtroBusqueda && (
            <button onClick={() => setFiltroBusqueda('')}
              className="text-xs text-slate-400 hover:text-slate-600 px-2">✕</button>
          )}
        </div>

        {filtroBusqueda && (
          <p className="text-xs text-slate-400 mb-3">{listaFiltrada.length} resultado(s)</p>
        )}

        <div className="space-y-2">
          {listaFiltrada.map(item => (
            <div key={item.id}
              className={`border rounded-xl p-4 flex items-start justify-between gap-3 transition
                ${editandoId === parseInt(String(item.id).replace('propio-', ''))
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-bold text-slate-800">{item.titulo}</p>
                  {item.origen === 'automatico' && (
                    <span className="text-[10px] bg-teal-50 text-teal-600 border border-teal-200 rounded-full px-2 py-0.5 shrink-0">🤖 Auto</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {[item.distrito, item.institucion, item.carrera].filter(Boolean).join(' · ')}
                </p>
                {(item.inicio_inscripcion || item.cierre_inscripcion) && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    📅 {item.inicio_inscripcion ? item.inicio_inscripcion.split('-').reverse().join('/') : '?'}
                    {' → '}
                    {item.cierre_inscripcion ? item.cierre_inscripcion.split('-').reverse().join('/') : '?'}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => editar(item)}
                  className="text-xs font-bold px-4 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition">
                  ✏️ Editar
                </button>
                <button onClick={() => borrar(item)}
                  className="text-xs font-bold px-4 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition">
                  🗑️ Borrar
                </button>
              </div>
            </div>
          ))}
          {listaFiltrada.length === 0 && lista.length > 0 && (
            <p className="text-xs text-slate-400 text-center py-8">
              Sin resultados para "{filtroBusqueda}"
            </p>
          )}
          {lista.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">
              Todavía no cargaste ningún concurso. Usá el formulario de arriba para agregar uno.
            </p>
          )}
        </div>
      </section>

      {/* ============================================================
          SECCIÓN 3: MONITOREO AUTOMÁTICO
      ============================================================ */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-800 mb-1">🤖 Monitoreo automático</h2>
        <p className="text-xs text-slate-400 mb-4">
          Agregá páginas para que el sistema las revise automáticamente todos los días y cargue
          los concursos nuevos que encuentre. En canales de Telegram, solo sigue links de los
          últimos 7 días.
        </p>

        <div className="flex gap-2 mb-4">
          <button onClick={revisarAhora} disabled={revisando}
            className="flex-1 bg-brand-600 text-white font-bold text-sm py-2.5 rounded-xl hover:bg-brand-700 disabled:opacity-50 transition">
            {revisando ? '⏳ Revisando...' : '🔍 Revisar ahora todas las páginas'}
          </button>
        </div>
        {msgRevision && (
          <p className={`text-xs mb-4 font-medium ${msgRevision.startsWith('✅') ? 'text-brand-700' : msgRevision.startsWith('❌') ? 'text-red-600' : 'text-slate-500'}`}>
            {msgRevision}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 mb-3">
          <input placeholder="Nombre (ej: SAD Moreno)" value={nuevaPaginaNombre}
            onChange={e => setNuevaPaginaNombre(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <input placeholder="https://t.me/s/sad_de_moreno" value={nuevaPaginaUrl}
            onChange={e => setNuevaPaginaUrl(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button onClick={agregarPagina}
            className="bg-slate-800 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-slate-700">
            + Agregar
          </button>
        </div>

        <div className="space-y-2">
          {paginas.map(p => (
            <div key={p.id} className="flex items-start justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{p.nombre}</p>
                <p className="text-xs text-slate-400 truncate">{p.url}</p>
                {p.ultimo_resultado && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Última revisión: {p.ultimo_resultado}
                  </p>
                )}
              </div>
              <button onClick={() => borrarPagina(p.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 shrink-0">
                Quitar
              </button>
            </div>
          ))}
          {paginas.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">
              Todavía no agregaste ninguna página para vigilar.
            </p>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          El monitoreo automático corre todos los días a las 8am sin que tengas que hacer nada.
        </p>
      </section>

    </main>
  );
}

// ----------------------------------------------------------------
// Componente campo de formulario reutilizable
// ----------------------------------------------------------------
function Campo({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
    </div>
  );
}

// ----------------------------------------------------------------
// Tarjeta de estadística
// ----------------------------------------------------------------
function StatCard({ label, valor, icono, color }: {
  label: string; valor: number; icono: string; color: 'brand' | 'teal' | 'green' | 'pink';
}) {
  const colores = {
    brand: 'bg-brand-50 border-brand-100 text-brand-700',
    teal:  'bg-teal-50  border-teal-100  text-teal-700',
    green: 'bg-green-50 border-green-100 text-green-700',
    pink:  'bg-pink-50  border-pink-100  text-pink-700',
  };
  return (
    <div className={`border rounded-xl p-4 text-center ${colores[color]}`}>
      <p className="text-2xl mb-1">{icono}</p>
      <p className="text-2xl font-extrabold">{valor.toLocaleString('es-AR')}</p>
      <p className="text-[11px] font-semibold mt-1 opacity-80">{label}</p>
    </div>
  );
}
