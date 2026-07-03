const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbFile = process.env.DB_FILE || path.resolve(__dirname, '../database.sqlite');
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbFile, err => {
  if (err) throw err;
});

const migrate = () => {
  const schema = [
    `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`,
    `
CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
`,
    `
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  zone_id INTEGER NOT NULL,
  lat REAL DEFAULT 0,
  lng REAL DEFAULT 0,
  FOREIGN KEY(zone_id) REFERENCES zones(id)
);
`,
    `
CREATE TABLE IF NOT EXISTS rate_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_zone INTEGER NOT NULL,
  to_zone INTEGER NOT NULL,
  order_type TEXT NOT NULL,
  rate_per_kg REAL NOT NULL,
  is_intra INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(from_zone) REFERENCES zones(id),
  FOREIGN KEY(to_zone) REFERENCES zones(id)
);
`,
    `
CREATE TABLE IF NOT EXISTS cod_surcharges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_type TEXT NOT NULL UNIQUE,
  surcharge REAL NOT NULL
);
`,
    `
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  zone_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  current_lat REAL,
  current_lng REAL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(zone_id) REFERENCES zones(id)
);
`,
    `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  admin_id INTEGER,
  agent_id INTEGER,
  pickup_area_id INTEGER NOT NULL,
  drop_area_id INTEGER NOT NULL,
  pickup_address TEXT,
  drop_address TEXT,
  length REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  actual_weight REAL NOT NULL,
  volumetric_weight REAL NOT NULL,
  billed_weight REAL NOT NULL,
  order_type TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Created',
  charge REAL NOT NULL,
  cod_surcharge REAL NOT NULL DEFAULT 0,
  reschedule_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES users(id),
  FOREIGN KEY(agent_id) REFERENCES agents(id),
  FOREIGN KEY(pickup_area_id) REFERENCES areas(id),
  FOREIGN KEY(drop_area_id) REFERENCES areas(id)
);
`,
    `
CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  actor_id INTEGER,
  actor_role TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
`
  ];

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      schema.forEach(sql => db.run(sql, err => { if (err) reject(err); }));
      resolve();
    });
  });
};

module.exports = { db, migrate };
