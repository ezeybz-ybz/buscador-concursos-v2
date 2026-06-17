'use client';

import { useEffect, useState } from 'react';

type ConcursoForm = {
  id?: number;
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
  titulo: '',
  campo: '',
  distrito: '',
  institucion: '',
  carrera: '',
  unidad_curricular: '',
  perfil: '',
  inicio_inscripcion: '',
  cierre_inscripcion: '',
  dia_horario: '',
  modulos: '',
  revista: '',
  modalidad: '',
  comunicado_url: '',
  notas: '',
};

export default function AdminPage() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [clave, setClave] = useState('');
  const [errorLogin, setErrorLogin] = useState('');

  const [lista, setLista] = useState<any[]>([]);
  const [form, setForm] = useState<ConcursoForm>(VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const [paginas, setPaginas] = useState<any[]>([]);
  const [nuevaPaginaNombre, setNuevaPaginaNombre] = useState('');
  const [nuevaPaginaUrl, setNuevaPaginaUrl] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [msgRevision, setMsgRevision] = useState('');

  useEffect(() => {
    verificarAuth();
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
    if (!data.ok) {
      setErrorLogin(data.error || 'Error de login');
      return;
    }
    setAutenticado(true);
    cargarLista();
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

  async function agregarPagina() {
    if (!nuevaPaginaNombre.trim() || !nuevaPaginaUrl.trim()) {
      setMsgRevision('❌ Completá nombre y URL');
      return;
    }
    await fetch('/api/admin/paginas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nuevaPaginaNombre, url: nuevaPaginaUrl }),
    });
    setNuevaPaginaNombre('');
    setNuevaPaginaUrl('');
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
    setMsgRevision('⏳ Revisando páginas vigiladas con IA, puede tardar un minuto...');
    try {
      const res = await fetch('/api/admin/revisar-ahora', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        setMsgRevision('❌ ' + (data.error || 'Error desconocido'));
      } else if (data.paginas_revisadas === 0) {
        setMsgRevision('⚠️ No hay páginas activas para revisar. Agregá alguna abajo.');
      } else {
        const totalNuevos = data.resultados.reduce((acc: number, r: any) => {
          const match = r.resumen?.match(/(\d+) nuevos/);
          return acc + (match ? parseInt(match[1]) : 0);
        }, 0);
        setMsgRevision(
          `✅ Revisión completa: ${data.paginas_revisadas} página(s) revisadas, ${totalNuevos} concurso(s) nuevo(s) cargados`
        );
        cargarLista();
        cargarPaginas();
      }
    } catch (e: any) {
      setMsgRevision('❌ Error: ' + e.message);
    } finally {
      setRevisando(false);
    }
  }

  function actualizarCampo(campo: keyof ConcursoForm, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function nuevoFormulario() {
    setForm(VACIO);
    setEditandoId(null);
  }

  function editar(item: any) {
    setForm({
      titulo: item.titulo || '',
      campo: item.campo || '',
      distrito: item.distrito || '',
      institucion: item.institucion || '',
      carrera: item.carrera || '',
      unidad_curricular: item.unidad_curricular || '',
      perfil: item.perfil || '',
      inicio_inscripcion: item.inicio_inscripcion || '',
      cierre_inscripcion: item.cierre_inscripcion || '',
      dia_horario: item.dia_horario || '',
      modulos: item.modulos || '',
      revista: item.revista || '',
      modalidad: item.modalidad || '',
      comunicado_url: item.comunicado_url || '',
      notas: item.notas || '',
    });
    setEditandoId(parseInt(String(item.id).replace('propio-', '')));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardar() {
    if (!form.titulo.trim()) {
      setMsg('❌ El título es obligatorio');
      return;
    }
    setGuardando(true);
    setMsg('');
    try {
      if (editandoId) {
        await fetch('/api/admin/concursos', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, id: editandoId }),
        });
        setMsg('✅ Concurso actualizado');
      } else {
        await fetch('/api/admin/concursos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        setMsg('✅ Concurso cargado');
      }
      nuevoFormulario();
      cargarLista();
    } catch (e: any) {
      setMsg('❌ ' + e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(item: any) {
    if (!confirm('¿Borrar este concurso?')) return;
    const id = String(item.id).replace('propio-', '');
    await fetch('/api/admin/concursos?id=' + id, { method: 'DELETE' });
    cargarLista();
  }

  // ----------------------------------------------------------------
  if (autenticado === null) {
    return <div className="text-center py-20 text-slate-400 text-sm">Verificando acceso…</div>;
  }

  if (!autenticado) {
    return (
      <main className="max-w-sm mx-auto px-4 py-24">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h1 className="text-lg font-bold text-center mb-4">🔐 Panel de administración</h1>
          <input
            type="password"
            placeholder="Clave de acceso"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {errorLogin && <p className="text-xs text-red-500 mb-3">{errorLogin}</p>}
          <button
            onClick={login}
            className="w-full bg-brand-600 text-white font-semibold text-sm py-2 rounded-lg hover:bg-brand-700"
          >
            Ingresar
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold mb-6">🛠️ Cargar / editar concursos propios</h1>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-8 shadow-sm">
        <h2 className="text-sm font-bold mb-4 text-slate-600">
          {editandoId ? 'Editando concurso' : 'Nuevo concurso'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Campo label="Título *" value={form.titulo} onChange={(v) => actualizarCampo('titulo', v)} />
          <Campo label="Campo / Perfil" value={form.campo} onChange={(v) => actualizarCampo('campo', v)} />
          <Campo label="Distrito" value={form.distrito} onChange={(v) => actualizarCampo('distrito', v)} />
          <Campo
            label="Institución"
            value={form.institucion}
            onChange={(v) => actualizarCampo('institucion', v)}
          />
          <Campo label="Carrera" value={form.carrera} onChange={(v) => actualizarCampo('carrera', v)} />
          <Campo
            label="Unidad curricular / Materia"
            value={form.unidad_curricular}
            onChange={(v) => actualizarCampo('unidad_curricular', v)}
          />
          <Campo
            label="Inicio inscripción"
            type="date"
            value={form.inicio_inscripcion}
            onChange={(v) => actualizarCampo('inicio_inscripcion', v)}
          />
          <Campo
            label="Cierre inscripción"
            type="date"
            value={form.cierre_inscripcion}
            onChange={(v) => actualizarCampo('cierre_inscripcion', v)}
          />
          <Campo
            label="Día y horario"
            value={form.dia_horario}
            onChange={(v) => actualizarCampo('dia_horario', v)}
          />
          <Campo label="Módulos" value={form.modulos} onChange={(v) => actualizarCampo('modulos', v)} />
          <Campo label="Revista" value={form.revista} onChange={(v) => actualizarCampo('revista', v)} />
          <Campo
            label="Modalidad"
            value={form.modalidad}
            onChange={(v) => actualizarCampo('modalidad', v)}
          />
          <Campo
            label="Link al comunicado"
            value={form.comunicado_url}
            onChange={(v) => actualizarCampo('comunicado_url', v)}
          />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
            Notas adicionales
          </label>
          <textarea
            value={form.notas}
            onChange={(e) => actualizarCampo('notas', e.target.value)}
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {msg && <p className="text-xs mt-3">{msg}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={guardar}
            disabled={guardando}
            className="bg-brand-600 text-white font-semibold text-sm px-5 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : editandoId ? 'Actualizar' : 'Guardar concurso'}
          </button>
          {editandoId && (
            <button
              onClick={nuevoFormulario}
              className="text-sm font-semibold px-5 py-2 rounded-lg border border-slate-200"
            >
              Cancelar edición
            </button>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-8 shadow-sm">
        <h2 className="text-sm font-bold mb-1 text-slate-600">🤖 Monitoreo automático con IA</h2>
        <p className="text-xs text-slate-400 mb-4">
          Agregá páginas para que se revisen automáticamente todos los días y se carguen solas los
          concursos nuevos que encuentre. Si una publicación solo tiene un link (a un comunicado,
          PDF o Google Doc), el sistema entra también ahí para leer el contenido completo.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 mb-4">
          <input
            placeholder="Nombre (ej: ISFD 21)"
            value={nuevaPaginaNombre}
            onChange={(e) => setNuevaPaginaNombre(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            placeholder="https://..."
            value={nuevaPaginaUrl}
            onChange={(e) => setNuevaPaginaUrl(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={agregarPagina}
            className="bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-700"
          >
            + Agregar
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {paginas.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.nombre}</p>
                <p className="text-xs text-slate-400 truncate">{p.url}</p>
                {p.ultimo_resultado && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Última revisión: {p.ultimo_resultado}
                  </p>
                )}
              </div>
              <button
                onClick={() => borrarPagina(p.id)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 shrink-0"
              >
                Quitar
              </button>
            </div>
          ))}
          {paginas.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-3">
              Todavía no agregaste ninguna página para vigilar.
            </p>
          )}
        </div>

        <button
          onClick={revisarAhora}
          disabled={revisando}
          className="w-full bg-brand-600 text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {revisando ? 'Revisando…' : '🔍 Revisar ahora'}
        </button>
        {msgRevision && <p className="text-xs mt-3">{msgRevision}</p>}
        <p className="text-[11px] text-slate-400 mt-3">
          Además de poder revisar manualmente con este botón, el sistema revisa todas las páginas
          activas automáticamente una vez por día.
        </p>
      </section>

      <h2 className="text-sm font-bold mb-3 text-slate-600">
        Concursos propios cargados ({lista.length})
      </h2>
      <div className="space-y-2">
        {lista.map((item) => (
          <div
            key={item.id}
            className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-sm font-semibold">{item.titulo}</p>
              <p className="text-xs text-slate-400">
                {item.distrito} {item.institucion ? '· ' + item.institucion : ''}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => editar(item)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-brand-400"
              >
                Editar
              </button>
              <button
                onClick={() => borrar(item)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
        {lista.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">Todavía no cargaste ningún concurso.</p>
        )}
      </div>
    </main>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
