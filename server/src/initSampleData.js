const { db, migrate } = require('./db');
const bcrypt = require('bcryptjs');

const runStmt = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
});

const init = async () => {
  await migrate();
  const adminPass = bcrypt.hashSync('admin123', 10);
  const agentPass = bcrypt.hashSync('agent123', 10);
  const customerPass = bcrypt.hashSync('customer123', 10);

  await runStmt('INSERT OR IGNORE INTO users (id, name, email, password, role, phone) VALUES (1, ?, ?, ?, ?, ?)', ['Admin User', 'admin@example.com', adminPass, 'admin', '9999999999']);
  await runStmt('INSERT OR IGNORE INTO users (id, name, email, password, role, phone) VALUES (2, ?, ?, ?, ?, ?)', ['Agent One', 'agent1@example.com', agentPass, 'agent', '8888888888']);
  await runStmt('INSERT OR IGNORE INTO users (id, name, email, password, role, phone) VALUES (3, ?, ?, ?, ?, ?)', ['Customer One', 'customer@example.com', customerPass, 'customer', '7777777777']);
  // Additional demo agents for manual assignment
  await runStmt('INSERT OR IGNORE INTO users (id, name, email, password, role, phone) VALUES (4, ?, ?, ?, ?, ?)', ['Agent Two', 'agent2@example.com', agentPass, 'agent', '6666666666']);
  await runStmt('INSERT OR IGNORE INTO users (id, name, email, password, role, phone) VALUES (5, ?, ?, ?, ?, ?)', ['Agent Three', 'agent3@example.com', agentPass, 'agent', '5555555555']);

  await runStmt('INSERT OR IGNORE INTO zones (id, name) VALUES (1, ?)', ['Zone A']);
  await runStmt('INSERT OR IGNORE INTO zones (id, name) VALUES (2, ?)', ['Zone B']);

  await runStmt('INSERT OR IGNORE INTO areas (id, name, zone_id, lat, lng) VALUES (1, ?, ?, ?, ?)', ['Koramangala', 1, 12.9352, 77.6245]);
  await runStmt('INSERT OR IGNORE INTO areas (id, name, zone_id, lat, lng) VALUES (2, ?, ?, ?, ?)', ['Indiranagar', 1, 12.9784, 77.6408]);
  await runStmt('INSERT OR IGNORE INTO areas (id, name, zone_id, lat, lng) VALUES (3, ?, ?, ?, ?)', ['Whitefield', 2, 12.9698, 77.7500]);
  await runStmt('INSERT OR IGNORE INTO areas (id, name, zone_id, lat, lng) VALUES (4, ?, ?, ?, ?)', ['Electronic City', 2, 12.8399, 77.6770]);

  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (1, ?, ?, ?, ?, ?)', [1, 1, 'B2C', 50, 1]);
  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (2, ?, ?, ?, ?, ?)', [1, 2, 'B2C', 60, 0]);
  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (3, ?, ?, ?, ?, ?)', [1, 1, 'B2B', 40, 1]);
  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (4, ?, ?, ?, ?, ?)', [1, 2, 'B2B', 50, 0]);
  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (5, ?, ?, ?, ?, ?)', [2, 1, 'B2C', 60, 0]);
  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (6, ?, ?, ?, ?, ?)', [2, 2, 'B2C', 45, 1]);
  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (7, ?, ?, ?, ?, ?)', [2, 1, 'B2B', 55, 0]);
  await runStmt('INSERT OR IGNORE INTO rate_cards (id, from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (8, ?, ?, ?, ?, ?)', [2, 2, 'B2B', 38, 1]);

  await runStmt('INSERT OR IGNORE INTO cod_surcharges (order_type, surcharge) VALUES (?, ?)', ['B2B', 120]);
  await runStmt('INSERT OR IGNORE INTO cod_surcharges (order_type, surcharge) VALUES (?, ?)', ['B2C', 80]);

  await runStmt('INSERT OR IGNORE INTO agents (id, user_id, zone_id, status, current_lat, current_lng) VALUES (1, ?, ?, ?, ?, ?)', [2, 1, 'available', 12.9352, 77.6245]);
  await runStmt('INSERT OR IGNORE INTO agents (id, user_id, zone_id, status, current_lat, current_lng) VALUES (2, ?, ?, ?, ?, ?)', [4, 1, 'available', 12.9784, 77.6408]);
  await runStmt('INSERT OR IGNORE INTO agents (id, user_id, zone_id, status, current_lat, current_lng) VALUES (3, ?, ?, ?, ?, ?)', [5, 2, 'available', 12.9698, 77.75]);


  console.log('Sample data seeded');
  process.exit(0);
};

init().catch(err => { console.error(err); process.exit(1); });
