const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const cards = JSON.parse(fs.readFileSync(path.join(publicDir, 'cards.json'), 'utf8'));
const portraits = JSON.parse(fs.readFileSync(path.join(publicDir, 'portraits.json'), 'utf8'));
for (const card of cards) {
  const portrait = portraits[card.name];
  if (!portrait || !portrait.url?.startsWith('/portraits/')) throw new Error(`Retrato ausente: ${card.name}`);
  if (!fs.existsSync(path.join(publicDir, portrait.url.slice(1)))) throw new Error(`Arquivo de retrato ausente: ${card.name}`);
}
console.log(`Static site ready: ${cards.length} cards and portraits verified.`);
