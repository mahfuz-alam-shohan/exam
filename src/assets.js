// R2 image serving helpers
export async function serveImage(path, env) {
  const key = path.split('/img/')[1];
  if (!key) return new Response('Image ID required', { status: 400 });

  const object = await env.BUCKET.get(key);
  if (!object) return new Response('Image not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('Content-Type') && object.httpMetadata?.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType);
  }
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
}
