import { cookies } from 'next/headers';
import crypto from 'crypto';

const COOKIE_NAME = 'admin_session';

function getSecret(): string {
  return process.env.ADMIN_PASSWORD || '';
}

function signToken(): string {
  const secret = getSecret();
  const payload = 'admin-ok';
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

export function verificarClave(clave: string): boolean {
  const secret = getSecret().trim();
  if (!secret) return false;
  return clave.trim() === secret;
}

export function crearSesion() {
  const token = signToken();
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });
}

export function cerrarSesion() {
  cookies().delete(COOKIE_NAME);
}

export function estaAutenticado(): boolean {
  const cookie = cookies().get(COOKIE_NAME);
  if (!cookie) return false;
  return cookie.value === signToken();
}
