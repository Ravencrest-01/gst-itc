import { client } from './client';

export function requestOtp(email) {
  return client.post('/auth/request-otp', { email });
}

export function register(payload) {
  return client.post('/auth/register', payload);
}

export function login(credentials) {
  return client.post('/auth/login', credentials);
}

export function me() {
  return client.get('/auth/me');
}

export function updateMe(updates) {
  return client.patch('/auth/me', updates);
}
