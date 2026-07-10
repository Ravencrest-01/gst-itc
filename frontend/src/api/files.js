import { client } from './client';

export function list(clientId) {
  return client.get(`/clients/${clientId}/files`);
}

export function upload(clientId, fileObj, kind, financialYear, taxPeriod) {
  const formData = new FormData();
  formData.append('file', fileObj);
  formData.append('kind', kind);
  formData.append('financial_year', financialYear);
  formData.append('tax_period', taxPeriod);

  return client.post(`/clients/${clientId}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export function remove(fileId) {
  return client.delete(`/files/${fileId}`);
}
