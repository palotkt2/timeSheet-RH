// Fetch a single entry from the remote plant to see full field structure
import Database from 'better-sqlite3';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const db = new Database('multi_plant.db');
const plants = db
  .prepare(
    'SELECT id, name, ip_address, port, api_base_path, use_https FROM plants WHERE is_active = 1',
  )
  .all();

const today = new Date().toISOString().split('T')[0];

for (const plant of plants) {
  const protocol = plant.use_https ? 'https' : 'http';
  const base = `${protocol}://${plant.ip_address}:${plant.port}${plant.api_base_path || ''}`;

  console.log(`\n=== ${plant.name} (${base}) ===`);

  try {
    const url = `${base}/barcode-entries?page=1&limit=1&startDate=${today}&endDate=${today}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    const entries = data.data || data.entries || [];
    if (entries.length > 0) {
      const entry = entries[0];
      const keys = Object.keys(entry);
      console.log('  Fields:', keys.join(', '));

      // Show each field with truncated values
      for (const key of keys) {
        let val = entry[key];
        if (typeof val === 'string' && val.length > 100) {
          val = val.substring(0, 80) + `... (${val.length} chars)`;
        }
        console.log(`  ${key}: ${val}`);
      }
    } else {
      console.log('  No entries for today, trying yesterday...');
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split('T')[0];
      const url2 = `${base}/barcode-entries?page=1&limit=1&startDate=${yesterday}&endDate=${yesterday}`;
      const res2 = await fetch(url2, { signal: AbortSignal.timeout(10000) });
      const data2 = await res2.json();
      const entries2 = data2.data || data2.entries || [];
      if (entries2.length > 0) {
        const entry = entries2[0];
        const keys = Object.keys(entry);
        console.log('  Fields:', keys.join(', '));
        for (const key of keys) {
          let val = entry[key];
          if (typeof val === 'string' && val.length > 100) {
            val = val.substring(0, 80) + `... (${val.length} chars)`;
          }
          console.log(`  ${key}: ${val}`);
        }
      } else {
        console.log('  No entries found');
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}

db.close();
