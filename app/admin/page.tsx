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
// Extrae todo el texto de un PDF usando pdf.js (cargado via CDN).
// Funciona con cualquier tipo de PDF: texto nativo, tablas, formularios.
// Si el PDF es un scan sin OCR, devuelve string vacío.
// ----------------------------------------------------------------
async function extraerTextoDePDF(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target!.result as ArrayBuffer);
        const pdfjsLib = (window as any)['pdfjs-dist/build/pdf'];
        if (!pdfjsLib) {
          // Fallback: si pdf.js no cargó, mandamos el archivo como base64 raw
          resolve('');
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        const textos: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const linea = content.items.map((item: any) => item.str).join(' ');
          textos.push(linea);
        }
        resolve(textos.join('\n'));
      } catch {
        resolve('');
      }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

// ----------------------------------------------------------------
// Fallback: lee el archivo como base64 para mandarlo directo a DeepSeek
// (útil si pdf.js falla o el PDF es un scan)
// ----------------------------------------------------------------
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

const PROMPT_EXTRACCION = `Sos un asistente especializado en concursos docentes de la provincia de Buenos Aires, Argentina.
Analizá el contenido y extraé TODOS los datos del llamado a concurso docente.
Devolvé SOLO un JSON con esta estructura exacta, sin texto antes ni después, sin bloques de código:
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
  "notas": "cualquier información relevante adicional: número de resolución, código de espacio, observaciones importantes"
}
Si no encontrás un dato, dejá el campo como string vacío "".
Si hay múltiples materias en el mismo documento, extraé la primera o la principal.`;

// ----------------------------------------------------------------
// Llama a DeepSeek con el texto del PDF (o base64 como fallback)
// ----------------------------------------------------------------
async function extraerDatosConIA(
  texto: string,
  base64: string,
  apiKey: string
): Promise<Partial<ConcursoForm>> {
  let body: any;

  if (texto && texto.trim().length > 100) {
    // Tenemos texto real: mandamos como texto plano (más barato y más preciso)
    body = {
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: PROMPT_EXTRACCION + '\n\nContenido del PDF:\n\n' + texto.slice(0, 15000),
      }],
      temperature: 0,
      max_tokens: 1500,
    };
  } else {
    // PDF sin texto extraíble (scan u otro): mandamos el archivo como imagen
    body = {
      model: 'deepseek-chat',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_EXTRACCION },
          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } },
        ],
      }],
      temperature: 0,
      max_tokens: 1500,
    };
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error de DeepSeek (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean) as Partial<ConcursoForm>;
  } catch {
    // Intento recuperar el JSON aunque haya texto alrededor
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    throw new Error('La IA no devolvió un JSON válido. Intentá de nuevo con el mismo PDF.');
  }
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

  // PDF con IA
  const [leyendoPDF, setLeyendoPDF] = useState(false);
  const [msgPDF, setMsgPDF] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Monitoreo automático
  const [paginas, setPaginas] = useState<any[]>([]);
  const [nuevaPaginaNombre, setNuevaPaginaNombre] = useState('');
  const [nuevaPaginaUrl, setNuevaPaginaUrl] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [msgRevision, setMsgRevision] = useState('');

  // Vista activa en la lista (para poder ir directo a editar)
  const [vistaActiva, setVistaActiva] = useState<'lista' | 'monitoreo'>('lista');

  useEffect(() => {
    verificarAuth();
    // Cargar pdf.js desde CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    document.head.appendChild(script);
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
      const savedKey = typeof window !== 'undefined' ? localStorage.getItem('ds_key') : '';
      if (savedKey) setDeepseekKey(savedKey);
    }
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
  // SUBIR PDF → IA → AUTOCOMPLETA
  // ----------------------------------------------------------------
  async function procesarPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!deepseekKey.trim()) {
      setMsgPDF('❌ Primero ingresá tu API key de DeepSeek en el campo de arriba.');
      return;
    }
    setLeyendoPDF(true);
    setMsgPDF('⏳ Extrayendo texto del PDF...');
    try {
      const [texto, base64] = await Promise.all([
        extraerTextoDePDF(file),
        fileToBase64(file),
      ]);
      setMsgPDF(
        texto.trim().length > 100
          ? '⏳ Texto extraído. Analizando con IA...'
          : '⏳ PDF sin texto extraíble, enviando como imagen a la IA...'
      );
      const datos = await extraerDatosConIA(texto, base64, deepseekKey.trim());
      // Completar el formulario con los datos, sin pisar lo que el usuario ya había escrito a mano
      setForm(prev => {
        const next = { ...prev };
        for (const key of Object.keys(VACIO) as (keyof ConcursoForm)[]) {
          if (datos[key] && String(datos[key]).trim()) {
            next[key] = String(datos[key]);
          }
        }
        return next;
      });
      setMsgPDF('✅ Datos cargados desde el PDF. Revisá y ajustá lo que sea necesario antes de guardar.');
    } catch (err: any) {
      setMsgPDF('❌ ' + err.message);
    } finally {
      setLeyendoPDF(false);
      if (inputFileRef.current) inputFileRef.current.value = '';
    }
  }

  function guardarKey(key: string) {
    setDeepseekKey(key);
    if (typeof window !== 'undefined') localStorage.setItem('ds_key', key);
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
    setMsgPDF('');
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
    setMsgPDF('');
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

        {/* PDF con IA */}
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-extrabold text-brand-700 mb-3">
            🤖 Auto-completar desde PDF con IA (DeepSeek)
          </p>
          <input type="password" placeholder="API key de DeepSeek (se guarda en tu navegador)"
            value={deepseekKey} onChange={e => guardarKey(e.target.value)}
            className="w-full border border-brand-200 bg-white rounded-lg px-3 py-2 text-xs mb-3 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-xs font-bold cursor-pointer transition
            ${leyendoPDF ? 'border-brand-200 text-brand-300 cursor-not-allowed' : 'border-brand-500 text-brand-600 hover:bg-brand-100'}`}>
            {leyendoPDF ? '⏳ Procesando PDF...' : '📄 Hacé clic acá para subir el PDF del llamado'}
            <input ref={inputFileRef} type="file" accept=".pdf" className="hidden" onChange={procesarPDF} disabled={leyendoPDF} />
          </label>
          {msgPDF && (
            <p className={`text-xs mt-2 font-medium ${msgPDF.startsWith('✅') ? 'text-brand-700' : msgPDF.startsWith('❌') ? 'text-red-600' : 'text-slate-500'}`}>
              {msgPDF}
            </p>
          )}
          <p className="text-[11px] text-brand-400 mt-2">
            La IA lee el PDF y completa los campos. Funciona con cualquier tipo de PDF.
            Revisá siempre los datos antes de guardar.
          </p>
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
