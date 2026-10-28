/**
 * NFRGuide — Route smoke test (Batch 01 §15).
 * Runs real HTTP requests against a running server (default http://localhost:3000)
 * and asserts status codes, server-rendered metadata, redirects, and the
 * published-only eligibility boundary. Exits non-zero on any failure.
 *
 * Usage: start the app (`npm run start`) then `npm run test:routes`.
 */

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;
const fails: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(path: string, redirect: RequestRedirect = 'follow') {
  const res = await fetch(`${BASE}${path}`, { redirect });
  const body = redirect === 'manual' ? '' : await res.text();
  return { res, body };
}

async function main() {
  console.log(`\nRoute smoke tests against ${BASE}\n`);

  // Homepage: 200 + server-rendered title + canonical
  {
    const { res, body } = await get('/');
    check('GET / returns 200', res.status === 200, `status ${res.status}`);
    check('/ has <title> with NFRGuide', /<title>[^<]*NFRGuide/i.test(body));
    check('/ has canonical link', /rel="canonical"/.test(body));
  }

  // Section landing (trailing slash canonical)
  {
    const { res, body } = await get('/competition/');
    check('GET /competition/ returns 200', res.status === 200, `status ${res.status}`);
    check('/competition/ renders section content', /NFR Competition/i.test(body));
  }

  // Article detail: 200 + JSON-LD structured data
  {
    const { res, body } = await get('/articles/inside-the-chutes-nfr-roughstock-intensity/');
    check('GET published article returns 200', res.status === 200, `status ${res.status}`);
    check('article emits JSON-LD', /application\/ld\+json/.test(body));
    check('article has canonical', /rel="canonical"/.test(body));
  }

  // Unknown/unpublished article slug: 404 (eligibility boundary — no leak)
  {
    const { res } = await get('/articles/this-article-does-not-exist-404/');
    check('GET unknown article returns 404', res.status === 404, `status ${res.status}`);
  }

  // Discipline guide
  {
    const { res } = await get('/disciplines/bull-riding/');
    check('GET /disciplines/bull-riding/ returns 200', res.status === 200, `status ${res.status}`);
  }

  // Category archive
  {
    const { res } = await get('/categories/nfr-competition/');
    check('GET /categories/nfr-competition/ returns 200', res.status === 200, `status ${res.status}`);
  }

  // Legacy redirect → HTTP 308 permanent.
  // The canonical legacy form (trailing slash) is a SINGLE permanent hop to the
  // new path; the no-slash form additionally passes through Next's trailing-slash
  // normalization (inherent to trailingSlash: true) before landing there.
  {
    const { res } = await get('/nfr-competition/', 'manual');
    const loc = res.headers.get('location') || '';
    check('GET /nfr-competition/ is a permanent redirect', res.status === 308 || res.status === 301, `status ${res.status}`);
    check('legacy redirect targets /competition/ in one hop', loc.endsWith('/competition/'), `location ${loc}`);
  }
  {
    // Following the full chain must ultimately resolve to /competition/ (200).
    const res = await fetch(`${BASE}/nfr-competition`);
    const landedPath = new URL(res.url).pathname;
    check('legacy path resolves to /competition/ (200)', res.status === 200 && landedPath === '/competition/', `landed ${landedPath} (${res.status})`);
  }

  // robots.txt disallows admin
  {
    const { res, body } = await get('/robots.txt');
    check('GET /robots.txt returns 200', res.status === 200, `status ${res.status}`);
    check('robots.txt disallows /admin', /Disallow:\s*\/admin/i.test(body), body.slice(0, 120));
  }

  // sitemap.xml lists URLs and excludes admin
  {
    const { res, body } = await get('/sitemap.xml');
    check('GET /sitemap.xml returns 200', res.status === 200, `status ${res.status}`);
    check('sitemap has <urlset>', /<urlset/.test(body));
    check('sitemap excludes /admin', !/\/admin/.test(body));
  }

  // Admin shell renders (prototype, dynamic)
  {
    const { res } = await get('/admin/');
    check('GET /admin/ returns 200', res.status === 200, `status ${res.status}`);
  }

  console.log(`\nRoute smoke: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error('FAILURES:\n' + fails.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke runner error:', err);
  process.exit(1);
});
