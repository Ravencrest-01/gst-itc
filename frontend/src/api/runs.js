import { client } from './client';

export function reconcile(clientId, payload) {
  return client.post(`/clients/${clientId}/runs`, payload);
}

export function recent() {
  return client.get('/runs/recent');
}

export function list(clientId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return client.get(`/clients/${clientId}/runs${query ? `?${query}` : ''}`);
}

export function results(runId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return client.get(`/runs/${runId}/matches${query ? `?${query}` : ''}`);
}

export function summary(runId) {
  return client.get(`/runs/${runId}/summary`);
}

export function invoices(runId, params = {}) {
  const query = new URLSearchParams(params).toString();
  return client.get(`/runs/${runId}/invoices${query ? `?${query}` : ''}`);
}

export function probable(runId) {
  return results(runId, { bucket: 'probable' });
}

export function remove(runId) {
  return client.delete(`/runs/${runId}`);
}

export function setStatus(runId, status) {
  return client.patch(`/runs/${runId}/status`, { status });
}

export function reviewMatch(runId, matchId, payload) {
  return client.patch(`/runs/${runId}/matches/${matchId}`, payload);
}
