const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const clientId = localStorage.getItem('activeClientId');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (clientId) headers['X-Client-Id'] = clientId;
  
  // Remove content-type if FormData is passed (browser sets it automatically with boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    
    // Auth failures
    if (response.status === 401) {
      localStorage.removeItem('token');
      // Trigger a redirect via event or auth context hook
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    const contentType = response.headers.get('content-type');
    let data;
    
    // Handle File Streams (e.g. downloads)
    if (contentType && (contentType.includes('application/vnd') || contentType.includes('application/pdf'))) {
        return response.blob();
    }
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    }
    
    if (!response.ok) {
      throw new ApiError(data?.detail || 'An API error occurred', response.status);
    }
    
    return data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new ApiError('Cannot connect to the server', 0);
    }
    throw error;
  }
}

export const client = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  post: (endpoint, body, options) => request(endpoint, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body), ...options }),
  patch: (endpoint, body, options) => request(endpoint, { method: 'PATCH', body: body instanceof FormData ? body : JSON.stringify(body), ...options }),
  delete: (endpoint, options) => request(endpoint, { method: 'DELETE', ...options }),
};
