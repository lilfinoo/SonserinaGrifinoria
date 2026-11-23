const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const envFile = ['.env', '.env.local'].map(file => path.join(__dirname, '..', file)).find(file => fs.existsSync(file));
  if (envFile) process.loadEnvFile(envFile);
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Configure DATABASE_URL_UNPOOLED ou DATABASE_URL antes de migrar.');
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_initial.sql'), 'utf8');
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migration 001 applied.');
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
