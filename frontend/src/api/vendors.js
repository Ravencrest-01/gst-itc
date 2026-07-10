import { client } from './client';

export function list(clientId) {
  return client.get(`/clients/${clientId}/vendors`);
}

export function create(clientId, payload) {
  return client.post(`/clients/${clientId}/vendors`, payload);
}

export function update(clientId, vendorId, payload) {
  return client.patch(`/clients/${clientId}/vendors/${vendorId}`, payload);
}

export function remove(clientId, vendorId) {
  return client.delete(`/clients/${clientId}/vendors/${vendorId}`);
}
