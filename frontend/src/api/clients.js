import { client } from './client';

export function list() {
  return client.get('/clients');
}

export function create(payload) {
  return client.post('/clients', payload);
}

export function get(id) {
  return client.get(`/clients/${id}`);
}

export function update(id, payload) {
  return client.patch(`/clients/${id}`, payload);
}

export function remove(id) {
  return client.delete(`/clients/${id}`);
}
