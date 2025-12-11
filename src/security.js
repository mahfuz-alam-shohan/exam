export const JWT_SECRET = "CHANGE_THIS_SECRET_IN_PROD_TO_SOMETHING_RANDOM_AND_LONG";

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...salt)) + ':' + btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(':');
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(hash))) === hashB64;
}

export async function signJwt(payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + 86400000 }));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

export async function verifyJwt(request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.split(' ')[1];
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    encoder.encode(`${header}.${body}`)
  );

  if (!valid) return null;
  const payload = JSON.parse(atob(body));
  if (Date.now() > payload.exp) return null;
  return payload;
}
