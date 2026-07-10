import { client } from './client';

export function downloadReport(runId, reportType) {
  // We don't use the standard JSON client here, we need to handle blobs for download
  const token = localStorage.getItem('token');
  const url = `${client.defaults.baseURL}/runs/${runId}/reports/${reportType}`;
  
  return fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }).then(response => {
    if (!response.ok) {
      throw new Error(`Failed to download ${reportType} report`);
    }
    return response.blob();
  }).then(blob => {
    // Create a link to download the file
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    // We could extract filename from Content-Disposition header if needed
    a.download = `itc_report_${runId}_${reportType}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  });
}
