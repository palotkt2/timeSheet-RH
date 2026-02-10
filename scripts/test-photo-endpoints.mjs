// Test if remote plants have an employee-photo endpoint
import Database from 'better-sqlite3';

const db = new Database('multi_plant.db');
const plants = db
  .prepare(
    'SELECT id, name, ip_address, port, api_base_path, use_https FROM plants WHERE is_active = 1',
  )
  .all();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

for (const plant of plants) {
  const protocol = plant.use_https ? 'https' : 'http';
  const base = `${protocol}://${plant.ip_address}:${plant.port}${plant.api_base_path || ''}`;

  // Try common photo endpoints with a known employee number
  const testEmpNum = '0403';
  const endpoints = [
    `${base}/employee-photo/${testEmpNum}`,
    `${base}/employees/${testEmpNum}/photo`,
    `${base}/fotos/${testEmpNum}`,
  ];

  console.log(`\n=== ${plant.name} (${base}) ===`);

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      console.log(
        `  ${url} → ${res.status} ${res.statusText} (Content-Type: ${res.headers.get('content-type')})`,
      );
    } catch (e) {
      console.log(`  ${url} → ERROR: ${e.message}`);
    }
  }
}

db.close();
