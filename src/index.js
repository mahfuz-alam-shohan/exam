/**
 * Cloudflare Worker - My Class (SaaS Masterclass)
 * - Security: Password Hashing, JWT, Server-Side Grading, Secure Headers
 * - Features: Admin/Teacher/Student portals, Analytics, R2 Images
 * - Fixes: Escaped backticks in ExamEditor fetch URL to fix build error
 */

import { addSecureHeaders } from './headers.js';
import { handleApi } from './api.js';
import { getHtml } from './html.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/')) {
      const response = await handleApi(request, env, path, url);
      return addSecureHeaders(response);
    }

    if (path.startsWith('/img/')) {
      const key = path.split('/img/')[1];
      if (!key) return new Response('Image ID required', { status: 400 });

      const object = await env.BUCKET.get(key);
      if (!object) return new Response('Image not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000');

      return new Response(object.body, { headers });
    }

    return addSecureHeaders(new Response(getHtml(), {
      headers: { 'Content-Type': 'text/html' },
    }));
  },
};

