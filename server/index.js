// Cloudflare Worker: /api/ops/… canlı oturuma gider (ops-room.js), geri kalan her şey derlenmiş uygulamadır (dist/).
import { ops, OpsRoom } from './ops-room.js';

// Durable Object sınıfı ana modülden dışa aktarılmalı (wrangler.jsonc → durable_objects)
export { OpsRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/ops/')) return ops(request, env, url);
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
