import { client } from './client';

export function get() {
  return client.get('/workspace');
}

export function update(payload) {
  return client.patch('/workspace', payload);
}

export function getSettings() {
  return client.get('/workspace/settings');
}

export function updateSettings(payload) {
  return client.patch('/workspace/settings', payload);
}

export function dashboardKpis() {
  return client.get('/workspace/dashboard-kpis');
}

export function getSubscription() {
  return client.get('/workspace/subscription');
}

export function createSubscription(payload) {
  return client.post('/workspace/subscription', payload);
}

export function updateSubscription(payload) {
  return client.patch('/workspace/subscription', payload);
}
