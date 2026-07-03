const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { auth } = require('./middleware');
const { calculateCharge } = require('./rateEngine');
const { notifyCustomer } = require('./notifications');

const router = express.Router();

const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const getRow = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const runStmt = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

const getAgentByUser = async userId => {
  return getRow('SELECT * FROM agents WHERE user_id = ?', [userId]);
};

const createHistory = async ({ orderId, status, actorId, actorRole, notes }) => {
  await runStmt(
    `INSERT INTO order_history (order_id, status, actor_id, actor_role, notes) VALUES (?, ?, ?, ?, ?)`,
    [orderId, status, actorId, actorRole, notes]
  );
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/register', async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ message: 'Missing fields' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await runStmt(
      'INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, role, phone || null]
    );
    const user = { id: result.lastID, name, email, role };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ user, token });
  } catch (err) {
    res.status(400).json({ message: 'Email may already exist', error: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await getRow('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ user: payload, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Zones & Areas ─────────────────────────────────────────────────────────────

// Public: areas are needed for order form before login (e.g. rate estimation page)
router.get('/areas', async (req, res) => {
  const rows = await runQuery(`SELECT areas.*, zones.name AS zone_name FROM areas JOIN zones ON areas.zone_id = zones.id ORDER BY zones.name, areas.name`);
  res.json(rows);
});

router.get('/zones', auth('admin'), async (req, res) => {
  const zones = await runQuery(`SELECT * FROM zones ORDER BY name`);
  res.json(zones);
});

router.post('/zones', auth('admin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Zone name is required' });
  try {
    const result = await runStmt('INSERT INTO zones (name) VALUES (?)', [name]);
    res.json({ id: result.lastID, name });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/zones/:id', auth('admin'), async (req, res) => {
  try {
    await runStmt('DELETE FROM zones WHERE id = ?', [req.params.id]);
    res.json({ message: 'Zone deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/areas', auth('admin'), async (req, res) => {
  const { name, zoneId, lat, lng } = req.body;
  if (!name || !zoneId) return res.status(400).json({ message: 'Name and zoneId are required' });
  const result = await runStmt(
    'INSERT INTO areas (name, zone_id, lat, lng) VALUES (?, ?, ?, ?)',
    [name, zoneId, lat || 0, lng || 0]
  );
  res.json({ id: result.lastID, name, zoneId, lat: lat || 0, lng: lng || 0 });
});

router.delete('/areas/:id', auth('admin'), async (req, res) => {
  try {
    await runStmt('DELETE FROM areas WHERE id = ?', [req.params.id]);
    res.json({ message: 'Area deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─── Rate Cards & COD ─────────────────────────────────────────────────────────

router.post('/rate-cards', auth('admin'), async (req, res) => {
  const { fromZone, toZone, orderType, ratePerKg } = req.body;
  if (!fromZone || !toZone || !orderType || !ratePerKg) {
    return res.status(400).json({ message: 'Missing rate card fields' });
  }
  try {
    const result = await runStmt(
      'INSERT INTO rate_cards (from_zone, to_zone, order_type, rate_per_kg, is_intra) VALUES (?, ?, ?, ?, ?)',
      [fromZone, toZone, orderType, ratePerKg, fromZone === toZone ? 1 : 0]
    );
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/rate-cards', auth('admin'), async (req, res) => {
  const cards = await runQuery(
    `SELECT rc.*, z1.name AS from_zone_name, z2.name AS to_zone_name
     FROM rate_cards rc
     JOIN zones z1 ON rc.from_zone = z1.id
     JOIN zones z2 ON rc.to_zone = z2.id
     ORDER BY z1.name, z2.name, rc.order_type`
  );
  res.json(cards);
});

router.delete('/rate-cards/:id', auth('admin'), async (req, res) => {
  try {
    await runStmt('DELETE FROM rate_cards WHERE id = ?', [req.params.id]);
    res.json({ message: 'Rate card deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/cod-surcharge', auth('admin'), async (req, res) => {
  const { orderType, surcharge } = req.body;
  if (!orderType || surcharge === undefined) return res.status(400).json({ message: 'Missing fields' });
  await runStmt('INSERT OR REPLACE INTO cod_surcharges (order_type, surcharge) VALUES (?, ?)', [orderType, surcharge]);
  res.json({ orderType, surcharge });
});

router.get('/cod-surcharges', auth(), async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM cod_surcharges ORDER BY order_type');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Agents ───────────────────────────────────────────────────────────────────

router.post('/agents', auth('admin'), async (req, res) => {
  const { userId, zoneId } = req.body;
  if (!userId || !zoneId) return res.status(400).json({ message: 'userId and zoneId are required' });
  try {
    const result = await runStmt(
      'INSERT INTO agents (user_id, zone_id, status) VALUES (?, ?, ?)',
      [userId, zoneId, 'available']
    );
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/agents', auth(['admin', 'agent']), async (req, res) => {
  const rows = await runQuery(
    `SELECT agents.*, users.name AS agent_name, users.email AS agent_email, zones.name AS zone_name
     FROM agents
     JOIN users ON agents.user_id = users.id
     JOIN zones ON agents.zone_id = zones.id
     ORDER BY agents.status, users.name`
  );
  res.json(rows);
});

// Agent updates their own location
router.patch('/agents/location', auth('agent'), async (req, res) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) return res.status(400).json({ message: 'Missing lat or lng' });
  try {
    const agent = await getAgentByUser(req.user.id);
    if (!agent) return res.status(404).json({ message: 'Agent record not found' });
    await runStmt(
      'UPDATE agents SET current_lat = ?, current_lng = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [lat, lng, agent.id]
    );
    res.json({ message: 'Location updated', agentId: agent.id, lat, lng });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Agent or admin updates agent status
router.patch('/agents/:id/status', auth(['admin', 'agent']), async (req, res) => {
  const { status } = req.body;
  if (!['available', 'busy'].includes(status)) {
    return res.status(400).json({ message: 'Status must be "available" or "busy"' });
  }
  try {
    const agentId = req.params.id;
    // Agents can only update themselves
    if (req.user.role === 'agent') {
      const agent = await getAgentByUser(req.user.id);
      if (!agent || agent.id !== Number(agentId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }
    await runStmt(
      'UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, agentId]
    );
    res.json({ agentId, status });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─── Auto-Assignment ──────────────────────────────────────────────────────────

const assignNearestAgent = async (pickupZoneId, pickupLat, pickupLng) => {
  // Prefer agents in pickup zone first
  let agents = await runQuery(
    `SELECT * FROM agents WHERE zone_id = ? AND status = 'available'`,
    [pickupZoneId]
  );

  // If none in pickup zone, broaden search to any available agent
  if (!agents.length) {
    agents = await runQuery(`SELECT * FROM agents WHERE status = 'available'`);
  }
  if (!agents.length) return null;

  // If pickup coordinates available, pick closest agent (prefer agents with coords)
  if (pickupLat && pickupLng) {
    let nearest = null;
    let minDist = Infinity;
    for (const agent of agents) {
      if (agent.current_lat && agent.current_lng) {
        const dx = agent.current_lat - pickupLat;
        const dy = agent.current_lng - pickupLng;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) { minDist = dist; nearest = agent; }
      } else if (!nearest) {
        // Keep a fallback if none have coords
        nearest = agent;
      }
    }
    return nearest;
  }

  // Fallback: oldest-available agent
  return agents[0];
};

const setAgentStatus = async (agentId, status) => {
  if (!agentId) return;
  await runStmt('UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, agentId]);
};

const assignOrderToAgent = async (orderId, newAgentId, actor) => {
  const agent = await getRow('SELECT * FROM agents WHERE id = ? AND status = ?', [newAgentId, 'available']);
  if (!agent) throw new Error('Agent is not available for assignment');
  const order = await getRow('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('Order not found');
  if (order.agent_id && order.agent_id !== agent.id) {
    await setAgentStatus(order.agent_id, 'available');
  }
  await runStmt(
    'UPDATE orders SET agent_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [agent.id, 'Assigned', orderId]
  );
  await setAgentStatus(agent.id, 'busy');
  await createHistory({ orderId, status: 'Assigned', actorId: actor.id, actorRole: actor.role, notes: `Assigned to agent ${agent.id}` });
  return agent;
};

const assignOrderAuto = async (orderId) => {
  const order = await getRow('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw new Error('Order not found');
  const pickupArea = await getRow('SELECT * FROM areas WHERE id = ?', [order.pickup_area_id]);
  const agent = await assignNearestAgent(pickupArea.zone_id, pickupArea.lat, pickupArea.lng);
  if (!agent) return null;
  if (order.agent_id && order.agent_id !== agent.id) {
    await setAgentStatus(order.agent_id, 'available');
  }
  await runStmt(
    'UPDATE orders SET agent_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [agent.id, 'Assigned', orderId]
  );
  await setAgentStatus(agent.id, 'busy');
  await createHistory({ orderId, status: 'Assigned', actorId: null, actorRole: 'system', notes: `Auto-assigned to agent ${agent.id}` });
  return agent;
};

// ─── Orders ───────────────────────────────────────────────────────────────────

// Calculate shipping charge estimate (no auth required for quote widget)
router.post('/orders/calculate', async (req, res) => {
  try {
    const estimate = await calculateCharge(req.body);
    res.json(estimate);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Create order
router.post('/orders', auth(), async (req, res) => {
  const {
    pickupAreaId, dropAreaId,
    pickupAddress, dropAddress,
    length, width, height, actualWeight,
    orderType, paymentType, customerId
  } = req.body;

  if (!pickupAreaId || !dropAreaId || !length || !width || !height || !actualWeight || !orderType || !paymentType) {
    return res.status(400).json({ message: 'Missing required order fields' });
  }

  try {
    const calc = await calculateCharge({ pickupAreaId, dropAreaId, length, width, height, actualWeight, orderType, paymentType });
    const customer = customerId ? Number(customerId) : (req.user.role === 'customer' ? req.user.id : null);
    if (!customer) {
      return res.status(400).json({ message: 'Admin must select a customer when creating an order on their behalf' });
    }

    // Validate customer exists
    const customerRow = await getRow('SELECT * FROM users WHERE id = ? AND role = ?', [customer, 'customer']);
    if (!customerRow) return res.status(400).json({ message: 'Customer not found or invalid customer ID' });

    const pickupArea = await getRow('SELECT * FROM areas WHERE id = ?', [pickupAreaId]);
    const agent = await assignNearestAgent(pickupArea.zone_id, pickupArea.lat, pickupArea.lng);
    const agentId = agent ? agent.id : null;
    const initialStatus = agent ? 'Assigned' : 'Pending';

    const orderResult = await runStmt(
      `INSERT INTO orders (customer_id, admin_id, agent_id, pickup_area_id, drop_area_id, pickup_address, drop_address,
        length, width, height, actual_weight, volumetric_weight, billed_weight,
        order_type, payment_type, charge, cod_surcharge, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer,
        req.user.role === 'admin' ? req.user.id : null,
        agentId, pickupAreaId, dropAreaId,
        pickupAddress || null, dropAddress || null,
        length, width, height, actualWeight,
        calc.volumetricWeight, calc.billedWeight,
        orderType, paymentType, calc.charge, calc.codSurcharge,
        initialStatus
      ]
    );
    const orderId = orderResult.lastID;

    await createHistory({
      orderId, status: initialStatus,
      actorId: req.user.id, actorRole: req.user.role,
      notes: agent ? `Auto-assigned to agent ${agent.id}` : 'Waiting for agent assignment'
    });

    if (agent) await setAgentStatus(agent.id, 'busy');

    await notifyCustomer({
      email: customerRow.email,
      phone: customerRow.phone,
      subject: `Order #${orderId} Created`,
      message: `Your order #${orderId} has been created with status "${initialStatus}". Estimated charge: ₹${calc.charge}.`
    });

    res.json({ id: orderId, charge: calc.charge, codSurcharge: calc.codSurcharge, status: initialStatus });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get all orders (with role-based filtering + admin filters)
router.get('/orders', auth(), async (req, res) => {
  let sql = `
    SELECT orders.*,
      u.name AS customer_name, u.email AS customer_email,
      pa.name AS pickup_area, da.name AS drop_area,
      z1.name AS pickup_zone, z2.name AS drop_zone,
      ag.current_lat AS agent_lat, ag.current_lng AS agent_lng,
      au.name AS agent_name
    FROM orders
    JOIN users u ON orders.customer_id = u.id
    JOIN areas pa ON orders.pickup_area_id = pa.id
    JOIN areas da ON orders.drop_area_id = da.id
    JOIN zones z1 ON pa.zone_id = z1.id
    JOIN zones z2 ON da.zone_id = z2.id
    LEFT JOIN agents ag ON orders.agent_id = ag.id
    LEFT JOIN users au ON ag.user_id = au.id
  `;
  const params = [];
  const filters = [];

  if (req.user.role === 'customer') {
    filters.push('orders.customer_id = ?');
    params.push(req.user.id);
  } else if (req.user.role === 'agent') {
    const agent = await getAgentByUser(req.user.id);
    if (!agent) return res.json([]);
    filters.push('orders.agent_id = ?');
    params.push(agent.id);
  }

  if (req.user.role === 'admin') {
    if (req.query.status) { filters.push('orders.status = ?'); params.push(req.query.status); }
    if (req.query.agentId) { filters.push('orders.agent_id = ?'); params.push(req.query.agentId); }
    if (req.query.pickupZone) { filters.push('z1.name = ?'); params.push(req.query.pickupZone); }
    if (req.query.dropZone) { filters.push('z2.name = ?'); params.push(req.query.dropZone); }
    if (req.query.customerId) { filters.push('orders.customer_id = ?'); params.push(req.query.customerId); }
  }

  if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
  sql += ' ORDER BY orders.created_at DESC';

  const rows = await runQuery(sql, params);
  res.json(rows);
});

// Get single order
router.get('/orders/:id', auth(), async (req, res) => {
  const order = await getRow(
    `SELECT orders.*,
      u.name AS customer_name, u.email AS customer_email,
      pa.name AS pickup_area, da.name AS drop_area,
      z1.name AS pickup_zone, z2.name AS drop_zone,
      ag.current_lat AS agent_lat, ag.current_lng AS agent_lng,
      au.name AS agent_name
     FROM orders
     JOIN users u ON orders.customer_id = u.id
     JOIN areas pa ON orders.pickup_area_id = pa.id
     JOIN areas da ON orders.drop_area_id = da.id
     JOIN zones z1 ON pa.zone_id = z1.id
     JOIN zones z2 ON da.zone_id = z2.id
     LEFT JOIN agents ag ON orders.agent_id = ag.id
     LEFT JOIN users au ON ag.user_id = au.id
     WHERE orders.id = ?`,
    [req.params.id]
  );
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
});

// Get order history/timeline
router.get('/orders/:id/history', auth(), async (req, res) => {
  const rows = await runQuery(
    `SELECT oh.*, u.name AS actor_name
     FROM order_history oh
     LEFT JOIN users u ON oh.actor_id = u.id
     WHERE oh.order_id = ?
     ORDER BY oh.created_at ASC`,
    [req.params.id]
  );
  res.json(rows);
});

// Update order status (agent + admin)
router.patch('/orders/:id/status', auth(['admin', 'agent']), async (req, res) => {
  const { status, notes } = req.body;
  const orderId = req.params.id;
  const validStatuses = ['Assigned', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const order = await getRow('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return res.status(404).json({ message: 'Order not found' });

  if (req.user.role === 'agent') {
    const agent = await getAgentByUser(req.user.id);
    if (!agent || order.agent_id !== agent.id) {
      return res.status(403).json({ message: 'Not your order' });
    }
  }

  await runStmt('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, orderId]);
  await createHistory({ orderId, status, actorId: req.user.id, actorRole: req.user.role, notes: notes || null });

  const customer = await getRow('SELECT * FROM users WHERE id = ?', [order.customer_id]);
  if (customer) {
    await notifyCustomer({
      email: customer.email,
      phone: customer.phone,
      subject: `Order #${orderId} — ${status}`,
      message: `Your order #${orderId} status has been updated to "${status}".${notes ? ` Note: ${notes}` : ''}`
    });
  }

  if (status === 'Delivered' || status === 'Failed') {
    await setAgentStatus(order.agent_id, 'available');
  }

  res.json({ orderId, status });
});

// Assign agent (manual or auto)
router.post('/orders/:id/assign', auth('admin'), async (req, res) => {
  const orderId = req.params.id;
  const { agentId } = req.body;
  try {
    const agent = agentId
      ? await assignOrderToAgent(orderId, agentId, req.user)
      : await assignOrderAuto(orderId);
    if (!agent) return res.status(400).json({ message: 'No available agent found for pickup zone' });
    res.json({ orderId, assignedAgent: agent.id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Reschedule failed order
router.post('/orders/:id/reschedule', auth('customer'), async (req, res) => {
  const { rescheduleDate } = req.body;
  if (!rescheduleDate) return res.status(400).json({ message: 'rescheduleDate is required' });

  const orderId = req.params.id;
  const order = await getRow('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [orderId, req.user.id]);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.status !== 'Failed') return res.status(400).json({ message: 'Reschedule only allowed after failed delivery' });

  const pickupArea = await getRow('SELECT * FROM areas WHERE id = ?', [order.pickup_area_id]);
  const newAgent = await assignNearestAgent(pickupArea.zone_id, pickupArea.lat, pickupArea.lng);
  const newStatus = newAgent ? 'Assigned' : 'Pending';

  // Free old agent
  if (order.agent_id) await setAgentStatus(order.agent_id, 'available');

  await runStmt(
    'UPDATE orders SET status = ?, reschedule_date = ?, agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newStatus, rescheduleDate, newAgent ? newAgent.id : null, orderId]
  );
  await createHistory({
    orderId, status: newStatus,
    actorId: req.user.id, actorRole: req.user.role,
    notes: `Rescheduled for ${rescheduleDate}${newAgent ? `, agent ${newAgent.id} assigned` : ''}`
  });
  if (newAgent) await setAgentStatus(newAgent.id, 'busy');

  const customer = await getRow('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (customer) {
    await notifyCustomer({
      email: customer.email,
      phone: customer.phone,
      subject: `Order #${orderId} Rescheduled`,
      message: `Your order #${orderId} has been rescheduled for ${rescheduleDate}. Status: ${newStatus}.`
    });
  }

  res.json({ orderId, status: newStatus, rescheduleDate, agent: newAgent ? newAgent.id : null });
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', auth('admin'), async (req, res) => {
  try {
    const role = req.query.role;
    let sql = 'SELECT id, name, email, role, phone, created_at FROM users';
    const params = [];
    if (role) { sql += ' WHERE role = ?'; params.push(role); }
    sql += ' ORDER BY name';
    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Admin Summary ────────────────────────────────────────────────────────────

router.get('/admin/summary', auth('admin'), async (req, res) => {
  const totalOrders = await getRow('SELECT COUNT(*) AS count FROM orders');
  const byStatus = await runQuery('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY status');
  const pendingCount = await getRow("SELECT COUNT(*) AS count FROM orders WHERE status = 'Pending'");
  const totalRevenue = await getRow('SELECT SUM(charge) AS total FROM orders');
  const agentStats = await runQuery(
    `SELECT ag.status, COUNT(*) AS count FROM agents ag GROUP BY ag.status`
  );
  res.json({
    totalOrders: totalOrders.count,
    byStatus,
    pendingCount: pendingCount.count,
    totalRevenue: totalRevenue.total || 0,
    agentStats
  });
});

module.exports = router;