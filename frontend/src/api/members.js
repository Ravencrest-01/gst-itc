import { client } from './client';

export function list() {
  return client.get('/workspace/members');
}

export function invite(email) {
  return client.post('/workspace/members', { email });
}

export function remove(memberId) {
  return client.delete(`/workspace/members/${memberId}`);
}
