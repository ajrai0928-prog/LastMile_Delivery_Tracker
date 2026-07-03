import { useEffect, useState, useRef } from 'react';
import * as api from './api';

const emptyForm = { name: '', email: '', password: '', role: 'customer', phone: '' };
const initialOrder = {
  pickupAreaId: '', dropAreaId: '',
  pickupAddress: '', dropAddress: '',
  length: 10, width: 10, height: 10,
  actualWeight: 1,
  orderType: 'B2C', paymentType: 'Prepaid',
  customerId: ''
};
const initialFilters = { status: '', pickupZone: '', dropZone: '', agentId: '' };

// Status configuration
const STATUS_FLOW = ['Created', 'Assigned', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Failed'];
const STATUS_COLORS = {
  Created: '#6366f1',
  Pending: '#f59e0b',
  Assigned: '#3b82f6',
  'Picked Up': '#8b5cf6',
  'In Transit': '#06b6d4',
  'Out for Delivery': '#f97316',
  Delivered: '#10b981',
  Failed: '#ef4444',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#6b7280';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '20px',
      fontSize: '0.75rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
    }}>
      {status}
    </span>
  );
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('dt_user') || 'null'));
  const [form, setForm] = useState(emptyForm);
  const [toasts, setToasts] = useState([]);

  const [areas, setAreas] = useState([]);
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [orderForm, setOrderForm] = useState(initialOrder);
  const [zones, setZones] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [agents, setAgents] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [codSurcharges, setCodSurcharges] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [adminTab, setAdminTab] = useState('orders');
  const [agentMyInfo, setAgentMyInfo] = useState(null);

  // Admin creation forms
  const [newZoneName, setNewZoneName] = useState('');
  const [newArea, setNewArea] = useState({ name: '', zoneId: '', lat: '', lng: '' });
  const [newRateCard, setNewRateCard] = useState({ fromZone: '', toZone: '', orderType: 'B2C', ratePerKg: 10 });
  const [newSurcharge, setNewSurcharge] = useState({ orderType: 'B2C', surcharge: 50 });
  const [newAgentMapping, setNewAgentMapping] = useState({ userId: '', zoneId: '' });
  const [manualAssignInputs, setManualAssignInputs] = useState({});
  const [rescheduleInputs, setRescheduleInputs] = useState({});

  const toast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };

  // Load areas (public endpoint, no auth needed)
  const loadAreas = async () => {
    try {
      const res = await api.getAreas();
      setAreas(res);
    } catch (err) {
      // Areas might not be available yet; silently ignore
    }
  };

  const loadOrders = async (query = {}) => {
    try {
      const filterValues = Object.entries(query).reduce((acc, [k, v]) => {
        if (v !== '' && v != null) acc[k] = v;
        return acc;
      }, {});
      const qs = new URLSearchParams(filterValues).toString();
      const res = await api.getOrders(qs ? `?${qs}` : '');
      setOrders(res);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const loadAdminMetadata = async () => {
    if (user?.role !== 'admin') return;
    try {
      const [z, rc, ag, customers, surcharges, s] = await Promise.all([
        api.getZones(),
        api.getRateCards(),
        api.getAgents(),
        api.getUsers('customer'),
        api.getCodSurcharges(),
        api.getAdminSummary()
      ]);
      setZones(z);
      setRateCards(rc);
      setAgents(ag);
      setAllCustomers(customers);
      setCodSurcharges(surcharges);
      setSummary(s);

      const agentUsers = await api.getUsers('agent');
      const activeIds = ag.map(a => a.user_id);
      setUnassignedUsers(agentUsers.filter(u => !activeIds.includes(u.id)));
    } catch (err) {
      toast('Failed to load admin data', 'error');
    }
  };

  const loadAgentInfo = async () => {
    if (user?.role !== 'agent') return;
    try {
      const ag = await api.getAgents();
      const mine = ag.find(a => a.user_id === user.id);
      setAgentMyInfo(mine || null);
    } catch (err) { /* agent endpoint might fail */ }
  };

  // On mount / login
  useEffect(() => {
    loadAreas(); // Always load areas (public)
    if (user) {
      loadOrders(user.role === 'admin' ? filters : {});
      if (user.role === 'admin') loadAdminMetadata();
      if (user.role === 'agent') loadAgentInfo();
    }
  }, [user]);

  // Admin filter changes
  useEffect(() => {
    if (user?.role === 'admin') loadOrders(filters);
  }, [filters]);

  // Live charge estimation
  useEffect(() => {
    const { pickupAreaId, dropAreaId, length, width, height, actualWeight } = orderForm;
    if (pickupAreaId && dropAreaId && length && width && height && actualWeight) {
      const t = setTimeout(() => handleEstimate(), 500);
      return () => clearTimeout(t);
    } else {
      setEstimate(null);
    }
  }, [
    orderForm.pickupAreaId, orderForm.dropAreaId,
    orderForm.length, orderForm.width, orderForm.height,
    orderForm.actualWeight, orderForm.orderType, orderForm.paymentType
  ]);

  // ── Auth ──────────────────────────────────────────────────────────────────

  const signIn = async mode => {
    if (mode === 'register' && (!form.name.trim() || !form.email.trim() || !form.password.trim())) {
      toast('Please fill in Full Name, Email, and Password to register', 'error');
      return;
    }
    try {
      const resp = mode === 'login'
        ? await api.login({ email: form.email, password: form.password })
        : await api.register(form);
      setUser(resp.user);
      localStorage.setItem('dt_user', JSON.stringify(resp.user));
      localStorage.setItem('dt_token', resp.token);
      toast(`Signed in as ${resp.user.name}`, 'success');
      setForm(emptyForm);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('dt_user');
    localStorage.removeItem('dt_token');
    setOrders([]);
    setSummary(null);
    setEstimate(null);
    setSelectedOrder(null);
    toast('Logged out', 'info');
  };

  const fillCredential = (email, password) => {
    setForm(prev => ({ ...prev, email, password }));
  };

  // ── Order actions ─────────────────────────────────────────────────────────

  const handleEstimate = async () => {
    try {
      const calc = await api.calculate(orderForm);
      setEstimate(calc);
    } catch (err) {
      setEstimate(null);
    }
  };

  const placeOrder = async () => {
    if (!orderForm.pickupAddress || !orderForm.dropAddress) {
      toast('Please enter both pickup and drop addresses', 'error');
      return;
    }
    try {
      const result = await api.createOrder(orderForm);
      toast(`Order #${result.id} created! Charge: ₹${result.charge}`, 'success');
      setOrderForm(initialOrder);
      setEstimate(null);
      loadOrders(user.role === 'admin' ? filters : {});
      if (user.role === 'admin') loadAdminMetadata();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await api.updateStatus(orderId, { status, notes: `Updated to ${status}` });
      toast(`Order #${orderId} → ${status}`, 'success');
      loadOrders(user.role === 'admin' ? filters : {});
      if (selectedOrder?.id === orderId) loadHistory(orderId);
      if (user.role === 'admin') loadAdminMetadata();
      if (user.role === 'agent') loadAgentInfo();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const assignAgent = async (orderId, agentId) => {
    try {
      await api.assignOrder(orderId, { agentId });
      toast(`Order #${orderId} assigned to agent #${agentId}`, 'success');
      loadOrders(filters);
      loadAdminMetadata();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const autoAssign = async orderId => {
    try {
      const r = await api.assignOrder(orderId, {});
      toast(`Order #${orderId} auto-assigned to nearest agent`, 'success');
      loadOrders(filters);
      loadAdminMetadata();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const rescheduleOrder = async orderId => {
    const date = rescheduleInputs[orderId];
    if (!date) { toast('Please pick a reschedule date first', 'error'); return; }
    try {
      await api.reschedule(orderId, { rescheduleDate: date });
      toast(`Order #${orderId} rescheduled for ${date}`, 'success');
      loadOrders({});
      if (selectedOrder?.id === orderId) loadHistory(orderId);
      setRescheduleInputs(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const loadHistory = async id => {
    try {
      const [h, ord] = await Promise.all([api.getHistory(id), api.getOrder(id)]);
      setHistory(h);
      setSelectedOrder(ord);
    } catch (err) {
      toast('Failed to load tracking details', 'error');
    }
  };

  // ── Agent actions ─────────────────────────────────────────────────────────

  const handleAgentLocationUpdate = async areaId => {
    const area = areas.find(a => a.id === Number(areaId));
    if (!area || !area.lat || !area.lng) { toast('No coordinates for selected area', 'error'); return; }
    try {
      await api.updateAgentLocation({ lat: area.lat, lng: area.lng });
      toast(`Location updated to ${area.name}`, 'success');
      loadAgentInfo();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleToggleAgentStatus = async () => {
    if (!agentMyInfo) return;
    const next = agentMyInfo.status === 'available' ? 'busy' : 'available';
    try {
      await api.updateAgentStatus(agentMyInfo.id, { status: next });
      toast(`Status set to ${next}`, 'success');
      loadAgentInfo();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // ── Admin actions ─────────────────────────────────────────────────────────

  const handleCreateZone = async e => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    try {
      await api.createZone({ name: newZoneName });
      toast(`Zone "${newZoneName}" created`, 'success');
      setNewZoneName('');
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleCreateArea = async e => {
    e.preventDefault();
    if (!newArea.name || !newArea.zoneId) return;
    try {
      await api.createArea({ name: newArea.name, zoneId: newArea.zoneId, lat: parseFloat(newArea.lat) || 0, lng: parseFloat(newArea.lng) || 0 });
      toast(`Area "${newArea.name}" created`, 'success');
      setNewArea({ name: '', zoneId: '', lat: '', lng: '' });
      loadAreas();
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleDeleteZone = async id => {
    if (!confirm('Delete this zone? This may break existing areas and rate cards.')) return;
    try {
      await api.deleteZone(id);
      toast('Zone deleted', 'success');
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleDeleteArea = async id => {
    if (!confirm('Delete this area?')) return;
    try {
      await api.deleteArea(id);
      toast('Area deleted', 'success');
      loadAreas();
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleCreateRateCard = async e => {
    e.preventDefault();
    const { fromZone, toZone, orderType, ratePerKg } = newRateCard;
    if (!fromZone || !toZone || !ratePerKg) return;
    try {
      await api.createRateCard({ fromZone, toZone, orderType, ratePerKg: Number(ratePerKg) });
      toast('Rate card saved', 'success');
      setNewRateCard({ fromZone: '', toZone: '', orderType: 'B2C', ratePerKg: 10 });
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleDeleteRateCard = async id => {
    try {
      await api.deleteRateCard(id);
      toast('Rate card deleted', 'success');
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleSetSurcharge = async e => {
    e.preventDefault();
    const { orderType, surcharge } = newSurcharge;
    if (!surcharge) return;
    try {
      await api.createCodSurcharge({ orderType, surcharge: Number(surcharge) });
      toast(`COD surcharge for ${orderType} updated`, 'success');
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleCreateAgentMapping = async e => {
    e.preventDefault();
    const { userId, zoneId } = newAgentMapping;
    if (!userId || !zoneId) return;
    try {
      await api.createAgent({ userId: Number(userId), zoneId: Number(zoneId) });
      toast('Agent registered to zone', 'success');
      setNewAgentMapping({ userId: '', zoneId: '' });
      loadAdminMetadata();
    } catch (err) { toast(err.message, 'error'); }
  };

  // ── Map helper: place agent dot based on coords or interpolate ─────────────

  const getAgentMapPosition = order => {
    if (!order) return { x: 50, y: 50 };

    const pickupArea = areas.find(a => a.id === order.pickup_area_id);
    const dropArea = areas.find(a => a.id === order.drop_area_id);
    if (!pickupArea || !dropArea) return { x: 50, y: 50 };

    // Convert lat/lng to percentage on a normalised bounding box
    const lats = areas.map(a => a.lat || 0).filter(Boolean);
    const lngs = areas.map(a => a.lng || 0).filter(Boolean);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const span = l => maxLat === minLat ? 50 : ((l - minLat) / (maxLat - minLat)) * 60 + 20;
    const spanL = l => maxLng === minLng ? 50 : ((l - minLng) / (maxLng - minLng)) * 60 + 20;

    const pX = spanL(pickupArea.lng || 0), pY = 80 - span(pickupArea.lat || 0);
    const dX = spanL(dropArea.lng || 0), dY = 80 - span(dropArea.lat || 0);

    // If agent has real live coordinates, use those
    if (order.agent_lat && order.agent_lng) {
      return { x: spanL(order.agent_lng), y: 80 - span(order.agent_lat), pX, pY, dX, dY };
    }

    // Interpolate based on status
    const pcts = { Created: 0, Pending: 0, Assigned: 0, 'Picked Up': 0.25, 'In Transit': 0.5, 'Out for Delivery': 0.8, Delivered: 1, Failed: 0.6 };
    const pct = pcts[order.status] || 0;
    return {
      x: pX + (dX - pX) * pct,
      y: pY + (dY - pY) * pct,
      pX, pY, dX, dY
    };
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const areasByZone = Object.values(areas.reduce((acc, area) => {
    const zoneName = area.zone_name || 'Unknown Zone';
    if (!acc[zoneName]) {
      acc[zoneName] = { zone: { id: area.zone_id || zoneName, name: zoneName }, areas: [] };
    }
    acc[zoneName].areas.push(area);
    return acc;
  }, {}));

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTIONS
  // ══════════════════════════════════════════════════════════════════════════════

  const loginSection = () => (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="login-logo">📦</div>
        <h1 className="login-title">Last-Mile Delivery</h1>
        <p className="login-subtitle">Manage shipments, rates, and agents in one place.</p>

        <div className="credential-buttons">
          <button className="cred-btn" onClick={() => fillCredential('admin@example.com', 'admin123')}>
            <span>🛡</span> Admin
          </button>
          <button className="cred-btn" onClick={() => fillCredential('agent1@example.com', 'agent123')}>
            <span>🚴</span> Agent
          </button>
          <button className="cred-btn" onClick={() => fillCredential('customer@example.com', 'customer123')}>
            <span>👤</span> Customer
          </button>
        </div>

        <div className="form-group">
          <label>Email</label>
          <input id="login-email" placeholder="email@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input id="login-password" type="password" placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </div>

        <div className="grid-2" style={{ marginTop: '1rem' }}>
          <button id="btn-login" onClick={() => signIn('login')}>Sign In</button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Already have an account? Enter your email and password above, then click Sign In.
        </p>

        <details style={{ marginTop: '1.25rem' }} open>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>New here? Register an account</summary>
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input type="password" placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="customer">Customer</option>
              <option value="agent">Delivery Agent</option>
            </select>
            <button id="btn-register" className="secondary" onClick={() => signIn('register')}>Register</button>
          </div>
        </details>
      </div>
    </div>
  );

  const header = () => (
    <div className="app-header">
      <div className="header-brand">
        <span className="header-icon">📦</span>
        <div>
          <div className="header-title">Last-Mile Delivery</div>
          <div className="header-sub">{user.name} · <span className="role-tag">{user.role.toUpperCase()}</span></div>
        </div>
      </div>
      <button className="secondary" id="btn-logout" onClick={logout}>Sign Out</button>
    </div>
  );

  // ── Order creation form ────────────────────────────────────────────────────

  const orderCreateForm = () => (
    <section className="card" id="order-create-section">
      <h2>🆕 {user.role === 'admin' ? 'Create Order (Admin)' : 'New Shipment'}</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Fill in the details below. Charges calculate automatically.
      </p>

      <div className="grid-2">
        <div className="form-group">
          <label>Pickup Area / Zone</label>
          <select id="select-pickup-area" value={orderForm.pickupAreaId} onChange={e => setOrderForm({ ...orderForm, pickupAreaId: e.target.value })}>
            <option value="">Select pickup area</option>
            {areasByZone.map(({ zone, areas: zAreas }) => (
              <optgroup key={zone.id} label={zone.name}>
                {zAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Drop Area / Zone</label>
          <select id="select-drop-area" value={orderForm.dropAreaId} onChange={e => setOrderForm({ ...orderForm, dropAreaId: e.target.value })}>
            <option value="">Select drop area</option>
            {areasByZone.map(({ zone, areas: zAreas }) => (
              <optgroup key={zone.id} label={zone.name}>
                {zAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>Pickup Address <span className="required">*</span></label>
          <input id="input-pickup-address" placeholder="e.g. 12, MG Road, Koramangala" value={orderForm.pickupAddress} onChange={e => setOrderForm({ ...orderForm, pickupAddress: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Drop Address <span className="required">*</span></label>
          <input id="input-drop-address" placeholder="e.g. 5, Park Street, Whitefield" value={orderForm.dropAddress} onChange={e => setOrderForm({ ...orderForm, dropAddress: e.target.value })} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: '0.5rem' }}>
        <div className="form-group">
          <label>Order Type</label>
          <select id="select-order-type" value={orderForm.orderType} onChange={e => setOrderForm({ ...orderForm, orderType: e.target.value })}>
            <option value="B2C">B2C — Business to Customer</option>
            <option value="B2B">B2B — Business to Business</option>
          </select>
        </div>
        <div className="form-group">
          <label>Payment</label>
          <select id="select-payment-type" value={orderForm.paymentType} onChange={e => setOrderForm({ ...orderForm, paymentType: e.target.value })}>
            <option value="Prepaid">Prepaid (Online)</option>
            <option value="COD">COD (Cash on Delivery)</option>
          </select>
        </div>
      </div>

      <div className="divider-label">Package Dimensions</div>
      <div className="grid-3">
        <div className="form-group">
          <label>Length (cm)</label>
          <input id="input-length" type="number" min="1" value={orderForm.length} onChange={e => setOrderForm({ ...orderForm, length: Number(e.target.value) || 0 })} />
        </div>
        <div className="form-group">
          <label>Width (cm)</label>
          <input id="input-width" type="number" min="1" value={orderForm.width} onChange={e => setOrderForm({ ...orderForm, width: Number(e.target.value) || 0 })} />
        </div>
        <div className="form-group">
          <label>Height (cm)</label>
          <input id="input-height" type="number" min="1" value={orderForm.height} onChange={e => setOrderForm({ ...orderForm, height: Number(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="form-group">
        <label>Actual Weight (kg)</label>
        <input id="input-weight" type="number" min="0.1" step="0.1" value={orderForm.actualWeight} onChange={e => setOrderForm({ ...orderForm, actualWeight: Number(e.target.value) || 0 })} />
      </div>

      {user.role === 'admin' && (
        <div className="form-group">
          <label>Place on behalf of Customer</label>
          <select id="select-customer" value={orderForm.customerId} onChange={e => setOrderForm({ ...orderForm, customerId: e.target.value })}>
            <option value="">Select customer (or leave blank to use your account)</option>
            {allCustomers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
          </select>
        </div>
      )}

      {estimate ? (
        <div className="quote" id="charge-estimate">
          <div className="quote-row"><span>Volumetric weight</span><strong>{estimate.volumetricWeight} kg</strong></div>
          <div className="quote-row"><span>Billed weight</span><strong>{estimate.billedWeight} kg</strong></div>
          <div className="quote-row"><span>Rate (zone {estimate.pickupZone?.name} → {estimate.dropZone?.name})</span><strong>₹{estimate.rate}/kg</strong></div>
          {estimate.codSurcharge > 0 && (
            <div className="quote-row"><span>COD surcharge</span><strong style={{ color: '#f59e0b' }}>+₹{estimate.codSurcharge}</strong></div>
          )}
          <div className="quote-total">
            <span>Estimated Total</span>
            <span>₹{estimate.charge}</span>
          </div>
          <button id="btn-place-order" style={{ marginTop: '1rem', width: '100%' }} onClick={placeOrder}>
            💳 Confirm & Book Shipment
          </button>
        </div>
      ) : (
        <div className="estimate-placeholder">
          Select areas and enter dimensions to see live charge estimate.
        </div>
      )}
    </section>
  );

  // ── Order card ─────────────────────────────────────────────────────────────

  const orderCard = order => (
    <div key={order.id} id={`order-${order.id}`}
      className={`order-card ${selectedOrder?.id === order.id ? 'selected' : ''}`}
      onClick={() => loadHistory(order.id)}>
      <div className="order-card-header">
        <div>
          <span className="order-id">#{order.id}</span>
          {order.order_type && <span className="order-type-tag">{order.order_type}</span>}
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="order-route">
        <div className="route-point pickup">
          <span className="route-icon">📍</span>
          <div>
            <div className="route-area">{order.pickup_area} <span className="zone-label">({order.pickup_zone})</span></div>
            {order.pickup_address && <div className="route-addr">{order.pickup_address}</div>}
          </div>
        </div>
        <div className="route-arrow">→</div>
        <div className="route-point drop">
          <span className="route-icon">🏁</span>
          <div>
            <div className="route-area">{order.drop_area} <span className="zone-label">({order.drop_zone})</span></div>
            {order.drop_address && <div className="route-addr">{order.drop_address}</div>}
          </div>
        </div>
      </div>

      <div className="order-meta">
        <span>💰 ₹{order.charge}{order.cod_surcharge > 0 ? ` (+₹${order.cod_surcharge} COD)` : ''}</span>
        <span>💳 {order.payment_type}</span>
        <span>👤 {order.customer_name || `Customer #${order.customer_id}`}</span>
        <span>🚴 {order.agent_name || (order.agent_id ? `Agent #${order.agent_id}` : 'Unassigned')}</span>
      </div>

      {/* Customer: reschedule failed */}
      {user.role === 'customer' && order.status === 'Failed' && (
        <div className="action-group" onClick={e => e.stopPropagation()}>
          <input type="date" id={`reschedule-date-${order.id}`}
            value={rescheduleInputs[order.id] || ''}
            onChange={e => setRescheduleInputs(prev => ({ ...prev, [order.id]: e.target.value }))}
            min={new Date().toISOString().split('T')[0]}
          />
          <button id={`btn-reschedule-${order.id}`} onClick={() => rescheduleOrder(order.id)}>📅 Reschedule</button>
        </div>
      )}

      {/* Admin: assign agent */}
      {user.role === 'admin' && (
        <div className="action-group" onClick={e => e.stopPropagation()}>
          <button id={`btn-auto-assign-${order.id}`} className="secondary" onClick={() => autoAssign(order.id)}>🤖 Auto Assign</button>
          <select id={`select-agent-${order.id}`}
            value={manualAssignInputs[order.id] || ''}
            onChange={e => setManualAssignInputs(prev => ({ ...prev, [order.id]: e.target.value }))}
          >
            <option value="">{agents.length ? 'Manual assign…' : 'No agents available'}</option>
            {agents.length > 0 && agents
              .slice()
              .sort((a, b) => {
                const aa = (a.status || '').toLowerCase() === 'available';
                const bb = (b.status || '').toLowerCase() === 'available';
                if (aa && !bb) return -1;
                if (!aa && bb) return 1;
                return 0;
              })
              .map(a => (
                <option key={a.id} value={a.id} disabled={(a.status || '').toLowerCase() !== 'available'}>
                  {a.agent_name} ({a.zone_name}){((a.status || '').toLowerCase() !== 'available') ? ` — ${a.status}` : ''}
                </option>
              ))}
          </select>
          {manualAssignInputs[order.id] && (
            <button id={`btn-confirm-assign-${order.id}`} onClick={() => assignAgent(order.id, manualAssignInputs[order.id])}>✔ Assign</button>
          )}
        </div>
      )}

      {/* Agent & Admin: status updates */}
      {(user.role === 'agent' || user.role === 'admin') && (
        <div className="status-buttons" onClick={e => e.stopPropagation()}>
          {['Picked Up', 'In Transit', 'Out for Delivery'].map(s => (
            <button key={s} id={`btn-status-${s.replace(/\s/g, '-')}-${order.id}`}
              className="secondary status-btn" onClick={() => updateOrderStatus(order.id, s)}>
              {s}
            </button>
          ))}
          <button id={`btn-delivered-${order.id}`} className="status-btn delivered"
            onClick={() => updateOrderStatus(order.id, 'Delivered')}>✅ Delivered</button>
          <button id={`btn-failed-${order.id}`} className="status-btn failed"
            onClick={() => updateOrderStatus(order.id, 'Failed')}>❌ Failed</button>
        </div>
      )}
    </div>
  );

  // ── Orders panel ───────────────────────────────────────────────────────────

  const ordersPanel = () => (
    <section className="card" id="orders-panel">
      <div className="panel-header">
        <h2>📋 Orders</h2>
        <span className="count-badge">{orders.length}</span>
      </div>

      {user.role === 'admin' && (
        <div className="filters-bar">
          <select id="filter-status" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Statuses</option>
            {STATUS_FLOW.concat(['Pending']).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select id="filter-pickup-zone" value={filters.pickupZone} onChange={e => setFilters({ ...filters, pickupZone: e.target.value })}>
            <option value="">Pickup Zone</option>
            {zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
          </select>
          <select id="filter-drop-zone" value={filters.dropZone} onChange={e => setFilters({ ...filters, dropZone: e.target.value })}>
            <option value="">Drop Zone</option>
            {zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
          </select>
          <select id="filter-agent" value={filters.agentId} onChange={e => setFilters({ ...filters, agentId: e.target.value })}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.agent_name}</option>)}
          </select>
          <button className="secondary" onClick={() => setFilters(initialFilters)}>Clear</button>
        </div>
      )}

      <div className="orders-list">
        {orders.length
          ? orders.map(orderCard)
          : <p className="empty-state">No orders found.</p>
        }
      </div>
    </section>
  );

  // ── Live Tracker ───────────────────────────────────────────────────────────

  const trackerPanel = () => {
    if (!selectedOrder) return null;
    const pos = getAgentMapPosition(selectedOrder);

    return (
      <section className="card tracker-card" id="tracker-panel">
        <div className="panel-header">
          <div>
            <h2>🗺 Live Tracking — Order #{selectedOrder.id}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
              {selectedOrder.pickup_address || selectedOrder.pickup_area} → {selectedOrder.drop_address || selectedOrder.drop_area} · <StatusBadge status={selectedOrder.status} />
            </p>
          </div>
          <button id="btn-close-tracker" className="secondary" onClick={() => setSelectedOrder(null)}>✕ Close</button>
        </div>

        <div className="tracker-grid">
          {/* Map */}
          <div>
            <h3>Delivery Map</h3>
            <div className="mock-map-container">
              <div className="mock-map-grid" />

              {/* Draw all areas as dots */}
              {areas.map(area => {
                const allLats = areas.map(a => a.lat || 0).filter(Boolean);
                const allLngs = areas.map(a => a.lng || 0).filter(Boolean);
                const minLat = Math.min(...allLats), maxLat = Math.max(...allLats);
                const minLng = Math.min(...allLngs), maxLng = Math.max(...allLngs);
                const xPct = maxLng === minLng ? 50 : ((area.lng - minLng) / (maxLng - minLng)) * 60 + 20;
                const yPct = maxLat === minLat ? 50 : 80 - ((area.lat - minLat) / (maxLat - minLat)) * 60 - 20;
                const isPickup = area.id === selectedOrder.pickup_area_id;
                const isDrop = area.id === selectedOrder.drop_area_id;
                return (
                  <div key={area.id}>
                    <div
                      className={`mock-map-node ${isPickup ? 'pickup' : isDrop ? 'drop' : 'neutral'}`}
                      style={{ left: `${xPct}%`, top: `${yPct}%` }}
                    />
                    {(isPickup || isDrop) && (
                      <div className="mock-map-label" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
                        {isPickup ? '📍' : '🏁'} {area.name}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Path line */}
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <line x1={`${pos.pX}%`} y1={`${pos.pY}%`} x2={`${pos.dX}%`} y2={`${pos.dY}%`}
                  stroke="rgba(99,102,241,0.5)" strokeWidth="2" strokeDasharray="6,4" />
              </svg>

              {/* Agent dot */}
              {selectedOrder.agent_id && (
                <div className="mock-map-agent" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} />
              )}
            </div>
            {selectedOrder.agent_lat && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
                📡 Live agent coordinates: {selectedOrder.agent_lat.toFixed(4)}, {selectedOrder.agent_lng.toFixed(4)}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div>
            <h3>Tracking Timeline</h3>
            <div className="timeline">
              {history.length === 0 && <p className="empty-state">No history yet.</p>}
              {history.map((item, idx) => (
                <div key={item.id} className={`timeline-item ${idx === history.length - 1 ? 'active' : ''}`}>
                  <div className="timeline-dot" />
                  <div className="timeline-header">
                    <StatusBadge status={item.status} />
                    <span className="timeline-role">{item.actor_name || item.actor_role}</span>
                  </div>
                  {item.notes && <p className="timeline-notes">{item.notes}</p>}
                  <span className="timeline-date">{new Date(item.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Order detail strip */}
        <div className="order-detail-strip">
          <div><span>Charge</span><strong>₹{selectedOrder.charge}</strong></div>
          <div><span>Payment</span><strong>{selectedOrder.payment_type}</strong></div>
          <div><span>Order Type</span><strong>{selectedOrder.order_type}</strong></div>
          <div><span>Billed Weight</span><strong>{selectedOrder.billed_weight} kg</strong></div>
          <div><span>Agent</span><strong>{selectedOrder.agent_name || (selectedOrder.agent_id ? `#${selectedOrder.agent_id}` : 'Unassigned')}</strong></div>
          {selectedOrder.reschedule_date && <div><span>Reschedule</span><strong>{selectedOrder.reschedule_date}</strong></div>}
        </div>
      </section>
    );
  };

  // ── Agent panel ────────────────────────────────────────────────────────────

  const agentPanel = () => (
    <section className="card" id="agent-panel">
      <h2>🚴 Agent Dashboard</h2>

      {agentMyInfo ? (
        <div className="agent-info-bar">
          <div>
            <div className="agent-info-name">{user.name}</div>
            <div className="agent-info-zone">Zone: {agentMyInfo.zone_name}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <StatusBadge status={agentMyInfo.status} />
            <button id="btn-toggle-status" className="secondary"
              onClick={handleToggleAgentStatus}>
              {agentMyInfo.status === 'available' ? '🔴 Go Busy' : '🟢 Go Available'}
            </button>
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Not yet registered as an agent. Ask admin to map your account to a zone.</p>
      )}

      <div className="form-group" style={{ marginTop: '1rem' }}>
        <label>📍 Simulate Location Update</label>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
          Selecting an area updates your GPS coordinates to that area's coordinates.
        </p>
        <select id="select-agent-location" defaultValue=""
          onChange={e => e.target.value && handleAgentLocationUpdate(e.target.value)}>
          <option value="">Select area to update location</option>
          {areas.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.zone_name}) — {a.lat?.toFixed(4)}, {a.lng?.toFixed(4)}</option>
          ))}
        </select>
      </div>

      {agentMyInfo?.current_lat && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Current location: {agentMyInfo.current_lat.toFixed(4)}, {agentMyInfo.current_lng.toFixed(4)}
        </p>
      )}
    </section>
  );

  // ── Admin dashboard ────────────────────────────────────────────────────────

  const adminDashboard = () => (
    <section className="card admin-card" id="admin-dashboard" style={{ gridColumn: 'span 2' }}>
      <h2>⚙️ Admin Settings</h2>

      <div className="tabs">
        {[['orders', '📊 Summary'], ['zones', '🗺 Zones & Areas'], ['rates', '💲 Rates & COD'], ['agents', '🚴 Agents']].map(([tab, label]) => (
          <button key={tab} id={`tab-${tab}`}
            className={`tab-btn ${adminTab === tab ? 'active' : ''}`}
            onClick={() => setAdminTab(tab)}>{label}</button>
        ))}
      </div>

      {/* ── Summary Tab ── */}
      {adminTab === 'orders' && summary && (
        <div className="admin-summary-grid">
          <div className="summary-metric">
            <span className="metric-value">{summary.totalOrders}</span>
            <span className="metric-label">Total Orders</span>
          </div>
          <div className="summary-metric">
            <span className="metric-value">₹{Math.round(summary.totalRevenue || 0).toLocaleString()}</span>
            <span className="metric-label">Total Revenue</span>
          </div>
          <div className="summary-metric">
            <span className="metric-value">{summary.pendingCount}</span>
            <span className="metric-label">Pending Assignment</span>
          </div>
          <div className="summary-metric">
            <span className="metric-value">{(summary.agentStats?.find(s => s.status === 'available')?.count) || 0}</span>
            <span className="metric-label">Available Agents</span>
          </div>
          <div className="by-status-list">
            <h3>Orders by Status</h3>
            {summary.byStatus?.map(s => (
              <div key={s.status} className="status-stat-row">
                <StatusBadge status={s.status} />
                <div className="status-bar">
                  <div style={{ width: `${(s.count / summary.totalOrders) * 100}%`, background: STATUS_COLORS[s.status] || '#6366f1', height: '6px', borderRadius: '3px' }} />
                </div>
                <strong>{s.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Zones & Areas Tab ── */}
      {adminTab === 'zones' && (
        <div className="admin-two-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <form onSubmit={handleCreateZone} className="admin-form">
              <h3>Create Zone</h3>
              <input id="input-zone-name" placeholder="Zone name (e.g. Zone C)" value={newZoneName}
                onChange={e => setNewZoneName(e.target.value)} required />
              <button type="submit">➕ Create Zone</button>
            </form>

            <form onSubmit={handleCreateArea} className="admin-form">
              <h3>Create Area</h3>
              <input id="input-area-name" placeholder="Area name (e.g. HSR Layout)" value={newArea.name}
                onChange={e => setNewArea({ ...newArea, name: e.target.value })} required />
              <select id="select-area-zone" value={newArea.zoneId}
                onChange={e => setNewArea({ ...newArea, zoneId: e.target.value })} required>
                <option value="">Select zone</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
              <div className="grid-2">
                <input id="input-area-lat" type="number" step="any" placeholder="Latitude (e.g. 12.9352)"
                  value={newArea.lat} onChange={e => setNewArea({ ...newArea, lat: e.target.value })} />
                <input id="input-area-lng" type="number" step="any" placeholder="Longitude (e.g. 77.6245)"
                  value={newArea.lng} onChange={e => setNewArea({ ...newArea, lng: e.target.value })} />
              </div>
              <button type="submit">➕ Create Area</button>
            </form>
          </div>

          <div className="admin-list-card">
            <h3>Zones</h3>
            <ul className="admin-list">
              {zones.map(z => (
                <li key={z.id} className="admin-list-item">
                  <span>🗺 <strong>{z.name}</strong></span>
                  <button id={`btn-delete-zone-${z.id}`} className="danger-btn"
                    onClick={() => handleDeleteZone(z.id)}>🗑</button>
                </li>
              ))}
            </ul>
            <h3 style={{ marginTop: '1rem' }}>Areas</h3>
            <ul className="admin-list">
              {areas.map(a => (
                <li key={a.id} className="admin-list-item">
                  <span>📍 <strong>{a.name}</strong> — <span style={{ color: 'var(--text-muted)' }}>{a.zone_name}</span>
                    {a.lat ? <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>({a.lat.toFixed(2)}, {a.lng?.toFixed(2)})</span> : ''}
                  </span>
                  <button id={`btn-delete-area-${a.id}`} className="danger-btn"
                    onClick={() => handleDeleteArea(a.id)}>🗑</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Rates & COD Tab ── */}
      {adminTab === 'rates' && (
        <div className="admin-two-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <form onSubmit={handleCreateRateCard} className="admin-form">
              <h3>Add Rate Card</h3>
              <div className="grid-2">
                <select id="select-rate-from" value={newRateCard.fromZone}
                  onChange={e => setNewRateCard({ ...newRateCard, fromZone: e.target.value })} required>
                  <option value="">From Zone</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
                <select id="select-rate-to" value={newRateCard.toZone}
                  onChange={e => setNewRateCard({ ...newRateCard, toZone: e.target.value })} required>
                  <option value="">To Zone</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <select id="select-rate-type" value={newRateCard.orderType}
                  onChange={e => setNewRateCard({ ...newRateCard, orderType: e.target.value })}>
                  <option value="B2C">B2C</option>
                  <option value="B2B">B2B</option>
                </select>
                <input id="input-rate-per-kg" type="number" min="1" placeholder="Rate ₹/kg"
                  value={newRateCard.ratePerKg}
                  onChange={e => setNewRateCard({ ...newRateCard, ratePerKg: e.target.value })} required />
              </div>
              <button type="submit">⚙️ Save Rate Card</button>
            </form>

            <form onSubmit={handleSetSurcharge} className="admin-form">
              <h3>COD Surcharge</h3>
              <div className="grid-2">
                <select id="select-surcharge-type" value={newSurcharge.orderType}
                  onChange={e => setNewSurcharge({ ...newSurcharge, orderType: e.target.value })}>
                  <option value="B2C">B2C</option>
                  <option value="B2B">B2B</option>
                </select>
                <input id="input-surcharge" type="number" min="0" placeholder="Surcharge ₹"
                  value={newSurcharge.surcharge}
                  onChange={e => setNewSurcharge({ ...newSurcharge, surcharge: e.target.value })} required />
              </div>
              <button type="submit">⚙️ Update Surcharge</button>
            </form>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="admin-list-card">
              <h3>Rate Cards</h3>
              <table className="admin-table">
                <thead>
                  <tr><th>From</th><th>To</th><th>Type</th><th>Rate</th><th></th></tr>
                </thead>
                <tbody>
                  {rateCards.map(rc => (
                    <tr key={rc.id}>
                      <td>{rc.from_zone_name}</td>
                      <td>{rc.to_zone_name}</td>
                      <td><span className="order-type-tag">{rc.order_type}</span></td>
                      <td>₹{rc.rate_per_kg}/kg</td>
                      <td>
                        <button id={`btn-delete-rc-${rc.id}`} className="danger-btn"
                          onClick={() => handleDeleteRateCard(rc.id)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                  {rateCards.length === 0 && <tr><td colSpan="5" className="empty-state">No rate cards yet.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="admin-list-card">
              <h3>COD Surcharges</h3>
              <table className="admin-table">
                <thead><tr><th>Order Type</th><th>Surcharge</th></tr></thead>
                <tbody>
                  {codSurcharges.map(cs => (
                    <tr key={cs.id}>
                      <td><span className="order-type-tag">{cs.order_type}</span></td>
                      <td>₹{cs.surcharge}</td>
                    </tr>
                  ))}
                  {codSurcharges.length === 0 && <tr><td colSpan="2" className="empty-state">No surcharges configured.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Agents Tab ── */}
      {adminTab === 'agents' && (
        <div className="admin-two-col">
          <form onSubmit={handleCreateAgentMapping} className="admin-form">
            <h3>Register Agent to Zone</h3>
            <div className="form-group">
              <label>Agent User Account</label>
              <select id="select-agent-user" value={newAgentMapping.userId}
                onChange={e => setNewAgentMapping({ ...newAgentMapping, userId: e.target.value })} required>
                <option value="">Select agent account</option>
                {unassignedUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
              </select>
              {unassignedUsers.length === 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  All agent accounts are already mapped.
                </span>
              )}
            </div>
            <div className="form-group">
              <label>Assign Zone</label>
              <select id="select-agent-zone" value={newAgentMapping.zoneId}
                onChange={e => setNewAgentMapping({ ...newAgentMapping, zoneId: e.target.value })} required>
                <option value="">Select zone</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <button type="submit">👤 Register Agent</button>
          </form>

          <div className="admin-list-card">
            <h3>Registered Agents</h3>
            <ul className="admin-list">
              {agents.map(a => (
                <li key={a.id} className="admin-list-item">
                  <div>
                    <div>🚴 <strong>{a.agent_name}</strong> — {a.zone_name}</div>
                    {a.current_lat && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        📍 {a.current_lat.toFixed(4)}, {a.current_lng?.toFixed(4)}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
              {agents.length === 0 && <li className="empty-state">No agents registered.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );

  // ── Main layout ────────────────────────────────────────────────────────────

  const mainPortal = () => (
    <div className="main-layout">
      {header()}
      {user.role === 'agent' && agentPanel()}
      <div className="content-grid">
        {(user.role === 'customer' || user.role === 'admin') && orderCreateForm()}
        {ordersPanel()}
      </div>
      {selectedOrder && trackerPanel()}
      {user.role === 'admin' && adminDashboard()}
    </div>
  );

  return (
    <div className="app">
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
      {user ? mainPortal() : loginSection()}
    </div>
  );
}

export default App;