// R2 image serving helpers
export async function serveImage(path, env) {
  const key = path.split('/img/')[1];
  if (!key) return new Response('Image ID required', { status: 400 });

  const object = await env.BUCKET.get(key);
  if (!object) return new Response('Image not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
}
