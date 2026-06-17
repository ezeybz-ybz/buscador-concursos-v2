# Buscador de Concursos Docentes

Web pública con buscador de concursos docentes (combina los datos de Docentes
Brown en vivo + concursos propios que cargás desde un panel de admin) y un
panel privado para administrar tus propias ofertas sin tocar ningún Excel.

## Qué incluye

- **Página pública (`/`)**: buscador por texto, distrito y carrera. Combina
  en vivo el CSV de Docentes Brown con tus concursos propios.
- **Panel de admin (`/admin`)**: protegido con una clave única. Permite
  cargar, editar y borrar tus propios concursos con un formulario simple.
- **Base de datos**: Postgres gratuito de Vercel, donde se guardan
  ÚNICAMENTE tus concursos propios (los de Docentes Brown se leen siempre
  en vivo, nunca se guardan).

## Cómo subir esto a Vercel (paso a paso)

### 1. Subir el código a GitHub

1. Entrá a [github.com](https://github.com) y creá un repositorio nuevo
   (puede ser privado).
2. Subí todos los archivos de esta carpeta a ese repositorio. La forma más
   fácil: en GitHub, botón **"uploading an existing file"** y arrastrá toda
   la carpeta (o usá GitHub Desktop si preferís interfaz visual).

### 2. Crear el proyecto en Vercel

1. Entrá a [vercel.com](https://vercel.com) y logueate (podés usar tu cuenta
   de GitHub directamente).
2. Click en **"Add New" → "Project"**.
3. Elegí **"Import Git Repository"** y seleccioná el repo que acabás de
   crear.
4. Vercel detecta automáticamente que es Next.js. No cambies nada en la
   configuración de build.
5. Antes de hacer click en "Deploy", bajá hasta **"Environment Variables"**
   y agregá:
   - `ADMIN_PASSWORD` = la clave que vos quieras usar para entrar a `/admin`
6. Click en **Deploy**. En 1-2 minutos tenés tu web online en una URL tipo
   `tu-proyecto.vercel.app`.

### 3. Conectar la base de datos (Postgres gratis)

1. Dentro de tu proyecto en Vercel, click en la pestaña **"Storage"**.
2. Click en **"Create Database"** → elegí **"Postgres"** (es gratis hasta
   un límite generoso de uso, más que suficiente para esto).
3. Seguí el asistente — Vercel conecta automáticamente las variables de
   entorno necesarias (`POSTGRES_URL`, etc.) a tu proyecto. No necesitás
   copiar nada a mano.
4. Una vez conectada, hacé click en **"Redeploy"** en la pestaña
   "Deployments" para que el proyecto tome la nueva conexión a la base.

### 4. Probarlo

- Abrí `tu-proyecto.vercel.app` → deberías ver el buscador con los
  concursos de Docentes Brown cargando automáticamente.
- Abrí `tu-proyecto.vercel.app/admin` → te pide la clave que pusiste en
  `ADMIN_PASSWORD`. Una vez adentro, podés cargar tus propios concursos con
  el formulario.
- Los concursos que cargues ahí van a aparecer mezclados con los de
  Docentes Brown en la página pública, marcados con la etiqueta
  **"⭐ Carga propia"**.

## Actualizar la web en el futuro

Cualquier cambio que necesites (textos, colores, campos nuevos) se hace
editando el código y volviendo a subirlo a GitHub — Vercel redeploya solo
automáticamente cada vez que hacés push.

## Notas técnicas

- Los datos de Docentes Brown **nunca se guardan**: cada vez que alguien
  visita la página, el servidor pide el CSV fresco directamente a Google
  Sheets. Por eso siempre está actualizado sin que tengas que hacer nada.
- El login del panel admin usa una cookie firmada con tu `ADMIN_PASSWORD`
  como secreto — no hay usuarios en la base de datos, es solo una clave.
- Si en algún momento querés cambiar la clave de admin, lo hacés desde
  Vercel → tu proyecto → Settings → Environment Variables → editás
  `ADMIN_PASSWORD` → Redeploy.
