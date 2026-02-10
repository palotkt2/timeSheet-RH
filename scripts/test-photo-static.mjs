// Test if remote plants serve photos as static files
import Database from 'better-sqlite3';

const db = new Database('multi_plant.db');
const plants = db
  .prepare(
    'SELECT id, name, ip_address, port, use_https FROM plants WHERE is_active = 1',
  )
  .all();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// The remote plants run Next.js on port 3001 — try static file paths
const testEmpNum = '0403';
const extensions = ['jpg', 'jpeg', 'png', 'webp'];

for (const plant of plants) {
  const protocol = plant.use_https ? 'https' : 'http';
  const base = `${protocol}://${plant.ip_address}:${plant.port}`;

  console.log(`\n=== ${plant.name} (${base}) ===`);

  for (const ext of extensions) {
    const paths = [
      `/fotos/${testEmpNum}.${ext}`,
      `/employees/${testEmpNum}.${ext}`,
      `/photos/${testEmpNum}.${ext}`,
      `/images/employees/${testEmpNum}.${ext}`,
    ];
    for (const p of paths) {
      try {
        const res = await fetch(`${base}${p}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        if (res.status !== 404) {
          console.log(
            `  ${p} → ${res.status} (Content-Type: ${res.headers.get('content-type')}, Size: ${res.headers.get('content-length')})`,
          );
        }
      } catch (e) {
        // skip timeouts silently
      }
    }
  }
  console.log('  (all common paths returned 404 or timeout)');
}

db.close();
