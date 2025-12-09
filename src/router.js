import { handleApi } from './api';
import { serveImage } from './assets';
import { getLandingPage, getStudentPage, getAdminPage } from './pages/dashboard';

const HTML_HEADERS = { 'Content-Type': 'text/html' };

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/api/')) {
    return handleApi(request, env, path, url);
  }

  if (path.startsWith('/img/')) {
    return serveImage(path, env);
  }

  if (path === '/student') {
    return new Response(getStudentPage(), { headers: HTML_HEADERS });
  }

  if (path === '/admin') {
    return new Response(getAdminPage(), { headers: HTML_HEADERS });
  }

  return new Response(getLandingPage(), { headers: HTML_HEADERS });
}
