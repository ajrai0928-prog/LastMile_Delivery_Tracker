const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

const request = async (path, options = {}) => {
  const token = localStorage.getItem('dt_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
};

export const register = body => request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
export const login = body => request('/auth/login', { method: 'POST', body: JSON.stringify(body) });

export const getAreas = () => request('/areas'); // Public - no auth needed
export const getOrders = (query = '') => request(`/orders${query}`);
export const getOrder = id => request(`/orders/${id}`);
export const getHistory = id => request(`/orders/${id}/history`);
export const calculate = body => request('/orders/calculate', { method: 'POST', body: JSON.stringify(body) });
export const createOrder = body => request('/orders', { method: 'POST', body: JSON.stringify(body) });
export const updateStatus = (id, body) => request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) });
export const reschedule = (id, body) => request(`/orders/${id}/reschedule`, { method: 'POST', body: JSON.stringify(body) });
export const assignOrder = (id, body) => request(`/orders/${id}/assign`, { method: 'POST', body: JSON.stringify(body) });

export const getZones = () => request('/zones');
export const createZone = body => request('/zones', { method: 'POST', body: JSON.stringify(body) });
export const deleteZone = id => request(`/zones/${id}`, { method: 'DELETE' });

export const createArea = body => request('/areas', { method: 'POST', body: JSON.stringify(body) });
export const deleteArea = id => request(`/areas/${id}`, { method: 'DELETE' });

export const getRateCards = () => request('/rate-cards');
export const createRateCard = body => request('/rate-cards', { method: 'POST', body: JSON.stringify(body) });
export const deleteRateCard = id => request(`/rate-cards/${id}`, { method: 'DELETE' });

export const createCodSurcharge = body => request('/cod-surcharge', { method: 'POST', body: JSON.stringify(body) });
export const getCodSurcharges = () => request('/cod-surcharges');

export const getAgents = () => request('/agents');
export const createAgent = body => request('/agents', { method: 'POST', body: JSON.stringify(body) });
export const updateAgentStatus = (agentId, body) => request(`/agents/${agentId}/status`, { method: 'PATCH', body: JSON.stringify(body) });
export const updateAgentLocation = body => request('/agents/location', { method: 'PATCH', body: JSON.stringify(body) });

export const getAdminSummary = () => request('/admin/summary');
export const getUsers = (role = '') => request(`/users${role ? `?role=${role}` : ''}`);
