/**
 * Cloudflare Worker - My Class (SaaS Masterclass)
 * - Branding: "My Class" (Playful, Kiddy, Mobile-First)
 * - Features: Persisted Session, Hash Routing, Mobile Bottom Nav, Deep Analytics, JSON Import
 * - Fixes: Escaped all backticks in ExamEditor and StudentExamApp to prevent build errors
 */

import { handleApi } from './api';
import { serveImage } from './assets';
import { getHtml } from './frontend';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/')) {
      return handleApi(request, env, path, url);
    }

    if (path.startsWith('/img/')) {
      return serveImage(path, env);
    }

    return new Response(getHtml(), {
      headers: { 'Content-Type': 'text/html' },
    });
  },
};
