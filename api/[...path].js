const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { attachDatabasePool } = require('@vercel/functions');

const cards = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/cards.json'), 'utf8'));
const dailyPoolSize = 80;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000 });
attachDatabasePool(pool);

class InvalidRequest extends Error {}

function requireValue(test, message) {
  if (!test) throw new InvalidRequest(message);
}

function password(value, salt) {
  return crypto.pbkdf2Sync(value, Buffer.from(salt, 'hex'), 600000, 32, 'sha256').toString('hex');
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function snapshot(room) {
  const result = Object.fromEntries(['code', 'players', 'phase', 'index', 'host', 'daily', 'multi', 'day', 'scores'].map(key => [key, room[key]]));
  result.total = room.deck.length;
  result.voted = Object.keys(room.votes);
  if (room.phase === 'vote' || room.phase === 'reveal') {
    const card = cards[room.deck[room.index]];
    result.card = Object.fromEntries(['name', 'work', 'category', 'desc'].map(key => [key, card[key]]));
    if (room.phase === 'reveal') Object.assign(result, { house: card.house, why: card.why, votes: room.votes });
  }
  return result;
}

function cookieValue(header, name) {
  const match = (header || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function dailyDeck(day) {
  const order = Array.from({ length: dailyPoolSize }, (_, i) => i);
  let seed = Number(day.replaceAll('-', ''));
  for (let i = order.length - 1; i > 0; i--) {
    seed = seed * 16807 % 2147483647;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, 10);
}

async function action(client, route, args, user, token, setCookie) {
  if (route === 'login' || route === 'register') {
    const name = typeof args.name === 'string' ? args.name.trim() : '';
    const pw = typeof args.password === 'string' ? args.password : '';
    requireValue(/^[\w.-]{3,24}$/.test(name) && pw.length >= 6 && pw.length <= 128, 'Use um usuário de 3 a 24 caracteres e senha de 6 a 128.');
    const found = await client.query('SELECT name, salt, hash FROM users WHERE lower(name)=lower($1)', [name]);
    let canonical = name;
    if (route === 'register') {
      requireValue(found.rowCount === 0, 'Esse usuário já existe.');
      const salt = crypto.randomBytes(16).toString('hex');
      await client.query('INSERT INTO users(name,salt,hash) VALUES($1,$2,$3)', [name, salt, password(pw, salt)]);
    } else {
      const row = found.rows[0];
      requireValue(row && crypto.timingSafeEqual(Buffer.from(row.hash, 'hex'), Buffer.from(password(pw, row.salt), 'hex')), 'Usuário ou senha incorretos.');
      canonical = row.name;
    }
    const fresh = crypto.randomBytes(32).toString('base64url');
    await client.query('INSERT INTO sessions(token,"user") VALUES($1,$2)', [fresh, canonical]);
    setCookie(fresh);
    return { user: canonical };
  }
  if (route === 'me') return { user };
  if (route === 'logout') {
    await client.query('DELETE FROM sessions WHERE token=$1', [token]);
    setCookie('');
    return {};
  }
  if (route === 'rank') {
    const day = today();
    requireValue(['dia', 'semana', 'geral'].includes(args.period), 'Período inválido.');
    let start = '0001-01-01';
    if (args.period === 'dia') start = day;
    if (args.period === 'semana') {
      const date = new Date(day + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      start = date.toISOString().slice(0, 10);
    }
    const ranked = await client.query('SELECT "user", SUM(points)::int AS points FROM results WHERE day BETWEEN $1 AND $2 GROUP BY "user" ORDER BY points DESC, lower("user")', [start, day]);
    return ranked.rows;
  }

  if (route === 'dashboard') {
    requireValue(user && user.toLowerCase() === 'mateus', 'Este painel é exclusivo do usuário mateus.');
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM results) AS results,
        (SELECT COUNT(*)::int FROM rooms WHERE data->>'phase' <> 'done') AS rooms
    `);
    return { ...stats.rows[0], characters: cards.length };
  }

  requireValue(user, 'Entre na sua conta para jogar online.');
  if (route === 'create') {
    const daily = args.mode === 'daily';
    const day = today();
    let deck;
    if (daily) deck = dailyDeck(day);
    else {
      const group = args.group;
      const category = args.category;
      const candidates = cards.map((card, index) => ({ card, index })).filter(({ card }) =>
        (category === 'Todas' || card.category === category) && (!group || card.groups?.includes(group))
      ).map(({ index }) => index);
      const count = Number(args.count);
      requireValue([5, 10, 20].includes(count) && candidates.length >= count, 'Seleção inválida.');
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      deck = candidates.slice(0, count);
    }
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const multi = Boolean(args.multi);
    const room = { code, host: user, players: [user], daily, multi, day, deck, index: 0, phase: multi ? 'lobby' : 'vote', votes: {}, scores: { [user]: 0 } };
    await client.query('INSERT INTO rooms(code,data) VALUES($1,$2::jsonb)', [code, JSON.stringify(room)]);
    return snapshot(room);
  }

  const code = typeof args.code === 'string' ? args.code : '';
  const foundRoom = await client.query('SELECT data FROM rooms WHERE code=$1 FOR UPDATE', [code]);
  requireValue(foundRoom.rowCount > 0, 'Sala não encontrada.');
  const room = foundRoom.rows[0].data;
  if (route === 'join' && !room.players.includes(user)) {
    requireValue(room.multi && room.phase === 'lobby' && room.players.length < 4, 'Sala lotada ou já iniciada.');
    room.players.push(user);
    room.scores[user] = 0;
  }
  requireValue(room.players.includes(user), 'Você não participa desta sala.');
  const phase = room.phase;
  if (route === 'start') {
    requireValue(user === room.host && phase === 'lobby' && room.players.length >= 2, 'Aguarde outro jogador.');
    room.phase = 'vote';
  } else if (route === 'vote') {
    requireValue(phase === 'vote' && args.index === room.index && !Object.hasOwn(room.votes, user) && ['G', 'S', 'C', 'L'].includes(args.house), 'Voto indisponível.');
    room.votes[user] = args.house;
    if (Object.keys(room.votes).length === room.players.length) {
      room.phase = 'reveal';
      for (const [player, vote] of Object.entries(room.votes)) room.scores[player] += Number(vote === cards[room.deck[room.index]].house);
      if (room.daily && room.index === room.deck.length - 1) {
        for (const [player, score] of Object.entries(room.scores)) {
          await client.query('INSERT INTO results("user",day,points) VALUES($1,$2,$3) ON CONFLICT("user",day) DO NOTHING', [player, room.day, score]);
        }
      }
    }
  } else if (route === 'next') {
    requireValue(user === room.host && phase === 'reveal' && args.index === room.index, 'Aguarde o anfitrião.');
    room.index++;
    room.votes = {};
    room.phase = room.index === room.deck.length ? 'done' : 'vote';
  } else if (route !== 'join' && route !== 'state') {
    throw new InvalidRequest('Ação inválida.');
  }
  if (route !== 'state' || JSON.stringify(room) !== JSON.stringify(foundRoom.rows[0].data)) {
    await client.query('UPDATE rooms SET data=$2::jsonb WHERE code=$1', [room.code, JSON.stringify(room)]);
  }
  return snapshot(room);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const route = new URL(req.url, 'http://localhost').pathname.replace(/^\/api\/?/, '');
  let args = req.body;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = null; }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return res.status(400).json({ error: 'Pedido inválido.' });
  const token = cookieValue(req.headers.cookie, 'sid');
  const client = await pool.connect();
  let setCookie = null;
  try {
    await client.query('BEGIN');
    const session = token ? await client.query('SELECT "user" FROM sessions WHERE token=$1', [token]) : { rowCount: 0, rows: [] };
    const result = await action(client, route, args, session.rows[0]?.user || null, token, value => { setCookie = value; });
    await client.query('COMMIT');
    if (setCookie !== null) {
      const value = setCookie ? `sid=${encodeURIComponent(setCookie)}; Path=/; HttpOnly; SameSite=Strict${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` : 'sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
      res.setHeader('Set-Cookie', value);
    }
    return res.status(200).json(result);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof InvalidRequest) return res.status(400).json({ error: error.message });
    if (error.code === '23505') return res.status(400).json({ error: 'Esse usuário já existe.' });
    console.error('API request failed:', error.message);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  } finally {
    client.release();
  }
};
