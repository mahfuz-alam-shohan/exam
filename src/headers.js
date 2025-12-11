export function addSecureHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy', "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; script-src 'self' https: 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' https: 'unsafe-inline'; font-src 'self' https: data:; connect-src *;");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
