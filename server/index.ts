import dotenv from 'dotenv';
import express from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dbPath = process.env.APP_DB_PATH
  ? path.resolve(root, process.env.APP_DB_PATH)
  : path.join(dataDir, 'app-state.json');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.AUTH_SECRET || 'adoetzgpt-local-dev-secret-change-me';
const { Client } = pg;

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.header('origin') || '*');
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-AdoetzGPT-Schema');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function schemaNameFromConfig(dbConfig: any) {
  const requested = String(dbConfig?.schemaName || process.env.POSTGRES_SCHEMA || 'adoetzgpt');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(requested)) {
    throw new Error('Invalid Postgres schema name.');
  }
  return requested;
}

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function clientConfigFromRequest(req: express.Request) {
  const dbConfig = req.body?.dbConfig || {};
  const databaseUrl = String(dbConfig.databaseUrl || '').trim();
  const database = String(dbConfig.database || '').trim();
  const user = String(dbConfig.user || '').trim();
  const password = String(dbConfig.password || '');
  const portValue = String(dbConfig.port || '').trim();
  const schemaName = schemaNameFromConfig(dbConfig);

  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    const url = new URL(databaseUrl);
    if (database) url.pathname = `/${database}`;
    if (user) url.username = user;
    if (password) url.password = password;
    if (portValue) url.port = portValue;
    return { schemaName, clientConfig: { connectionString: url.toString() } };
  }

  if (databaseUrl && database && user) {
    return {
      schemaName,
      clientConfig: {
        host: databaseUrl,
        database,
        user,
        password,
        port: portValue ? Number(portValue) : 5432,
      },
    };
  }

  if (process.env.DATABASE_URL) {
    return { schemaName, clientConfig: { connectionString: process.env.DATABASE_URL } };
  }

  throw new Error('Postgres settings are required.');
}

async function withPostgres<T>(req: express.Request, callback: (client: pg.Client, schemaName: string) => Promise<T>) {
  const { schemaName, clientConfig } = clientConfigFromRequest(req);
  const client = new Client(clientConfig);
  await client.connect();
  try {
    return await callback(client, schemaName);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ensurePostgres(client: pg.Client, schemaName: string) {
  const schema = quoteIdent(schemaName);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.app_states (
      user_id TEXT PRIMARY KEY REFERENCES ${schema}.users(id) ON DELETE CASCADE,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function publicUser(row: any) {
  const username = row.username || row.email || 'user';
  return {
    id: row.id,
    username,
    email: row.email || undefined,
    displayName: row.display_name || username,
  };
}

function signToken(userId: string, schemaName: string) {
  return jwt.sign({ sub: userId, schemaName }, jwtSecret, { expiresIn: '365d' });
}

async function authUser(client: pg.Client, req: express.Request, schemaName: string) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Missing auth token.');
  const payload = jwt.verify(token, jwtSecret) as any;
  await ensurePostgres(client, schemaName);
  const schema = quoteIdent(schemaName);
  const result = await client.query(`SELECT * FROM ${schema}.users WHERE id = $1`, [payload.sub]);
  if (result.rowCount === 0) throw new Error('User not found.');
  return { user: result.rows[0], schemaName };
}

async function readState() {
  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeState(state: unknown) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const payload = {
    ...(typeof state === 'object' && state !== null ? state : {}),
    savedAt: Date.now(),
  };
  await fs.writeFile(dbPath, JSON.stringify(payload, null, 2));
  return payload;
}

app.get('/api/app-state', async (_req, res, next) => {
  try {
    res.json({ state: await readState() });
  } catch (error) {
    next(error);
  }
});

app.put('/api/app-state', async (req, res, next) => {
  try {
    res.json({ state: await writeState(req.body) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath, postgres: Boolean(process.env.DATABASE_URL) });
});

app.get('/api/postgres/schema.sql', (req, res) => {
  const schemaName = schemaNameFromConfig({ schemaName: req.query.schema || process.env.POSTGRES_SCHEMA });
  const schema = quoteIdent(schemaName);
  res.type('text/plain').send(`CREATE SCHEMA IF NOT EXISTS ${schema};

CREATE TABLE IF NOT EXISTS ${schema}.users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ${schema}.app_states (
  user_id TEXT PRIMARY KEY REFERENCES ${schema}.users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`);
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    await withPostgres(req, async (client, schemaName) => {
      await ensurePostgres(client, schemaName);
      const schema = quoteIdent(schemaName);
      const username = String(req.body.username || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-64 characters using letters, numbers, dot, dash, or underscore.' });
      }
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

      const id = randomUUID();
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await client.query(
        `INSERT INTO ${schema}.users (id, username, display_name, password_hash) VALUES ($1, $2, $3, $4) RETURNING *`,
        [id, username, username, passwordHash],
      );
      await client.query(`INSERT INTO ${schema}.app_states (user_id, state) VALUES ($1, '{}'::jsonb)`, [id]);
      const user = publicUser(result.rows[0]);
      res.json({ user, token: signToken(user.id, schemaName), state: null });
    });
  } catch (error: any) {
    const message = error?.code === '23505' ? 'Username is already registered.' : error.message || 'Unable to sign up.';
    res.status(400).json({ error: message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await withPostgres(req, async (client, schemaName) => {
      await ensurePostgres(client, schemaName);
      const schema = quoteIdent(schemaName);
      const username = String(req.body.username || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const result = await client.query(`SELECT * FROM ${schema}.users WHERE username = $1`, [username]);
      if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid username or password.' });
      const userRow = result.rows[0];
      const isValid = await bcrypt.compare(password, userRow.password_hash);
      if (!isValid) return res.status(401).json({ error: 'Invalid username or password.' });
      const stateResult = await client.query(`SELECT state FROM ${schema}.app_states WHERE user_id = $1`, [userRow.id]);
      const user = publicUser(userRow);
      res.json({ user, token: signToken(user.id, schemaName), state: stateResult.rows[0]?.state || null });
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Unable to log in.' });
  }
});

app.get('/api/sync/state', async (req, res) => {
  try {
    await withPostgres(req, async (client, schemaName) => {
      const { user } = await authUser(client, req, schemaName);
      const schema = quoteIdent(schemaName);
      const result = await client.query(`SELECT state FROM ${schema}.app_states WHERE user_id = $1`, [user.id]);
      res.json({ state: result.rows[0]?.state || null });
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'Unable to load sync state.' });
  }
});

app.post('/api/sync/state/pull', async (req, res) => {
  try {
    await withPostgres(req, async (client, schemaName) => {
      const { user } = await authUser(client, req, schemaName);
      const schema = quoteIdent(schemaName);
      const result = await client.query(`SELECT state FROM ${schema}.app_states WHERE user_id = $1`, [user.id]);
      res.json({ state: result.rows[0]?.state || null });
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'Unable to load sync state.' });
  }
});

app.put('/api/sync/state', async (req, res) => {
  try {
    await withPostgres(req, async (client, schemaName) => {
      const { user } = await authUser(client, req, schemaName);
      const schema = quoteIdent(schemaName);
      const state = req.body.state || {};
      await client.query(
        `INSERT INTO ${schema}.app_states (user_id, state, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
        [user.id, JSON.stringify(state)],
      );
      res.json({ ok: true });
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Unable to save sync state.' });
  }
});

if (isProduction) {
  const distPath = path.join(root, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  const vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      host,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  console.log(`Adoetz Chat running at http://${host}:${port}`);
  console.log(`Shared state database: ${dbPath}`);
});
