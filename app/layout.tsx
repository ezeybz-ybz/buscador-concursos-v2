import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Concursos Docentes — Buscador en tiempo real',
  description: 'Encontrá concursos docentes vigentes por distrito, carrera o título.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen text-slate-800">{children}</body>
    </html>
  );
}
