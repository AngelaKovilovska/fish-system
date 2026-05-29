const API_BASE = '/api';

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 sec timeout

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
      ...options,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Серверска грешка');
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Барањето истече — серверот не одговори. Обидете се повторно.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // Users
  getUsers: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  // Norms
  getNorms: () => request('/norms'),
  updateNorm: (id, data) => request(`/norms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Records
  getRecords: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/records?${query}`);
  },
  getCalendar: (month) => request(`/records/calendar?month=${month}`),
  getRecord: (id) => request(`/records/${id}`),
  createRecord: (data) => request('/records', { method: 'POST', body: JSON.stringify(data) }),
  updateRecord: (id, data) => request(`/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRecord: (id) => request(`/records/${id}`, { method: 'DELETE' }),

  // Alerts
  getAlerts: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/alerts?${query}`);
  },
  acknowledgeAlert: (id) => request(`/alerts/${id}/acknowledge`, { method: 'PUT' }),

  // Reports
  sendDailyReport: (recordId) => request(`/reports/daily/${recordId}`, { method: 'POST' }),

  // Preview (data only)
  previewFoodReport: (from, to, pool_number) => request('/reports/food-consumption', { method: 'POST', body: JSON.stringify({ from, to, pool_number: pool_number || undefined }) }),
  getMeasurementDates: (pool_number) => request(`/reports/measurement-dates${pool_number ? `?pool_number=${pool_number}` : ''}`),
  previewAvgWeightReport: (pool_number, measurement_date) => request('/reports/avg-weight', { method: 'POST', body: JSON.stringify({ pool_number: pool_number || undefined, measurement_date: measurement_date || undefined }) }),
  previewAlertsReport: (from, to) => request('/reports/alerts', { method: 'POST', body: JSON.stringify({ from, to }) }),
  previewSortingReport: (from, to) => request('/reports/sorting', { method: 'POST', body: JSON.stringify({ from, to }) }),
  previewPurchasesReport: (from, to) => request('/reports/food-purchases', { method: 'POST', body: JSON.stringify({ from, to }) }),

  // Send email
  sendFoodReport: (from, to, pool_number) => request('/reports/food-consumption', { method: 'POST', body: JSON.stringify({ from, to, pool_number: pool_number || undefined, sendEmail: true }) }),
  sendAvgWeightReport: (pool_number, measurement_date) => request('/reports/avg-weight', { method: 'POST', body: JSON.stringify({ pool_number: pool_number || undefined, measurement_date: measurement_date || undefined, sendEmail: true }) }),
  sendAlertsReport: (from, to) => request('/reports/alerts', { method: 'POST', body: JSON.stringify({ from, to, sendEmail: true }) }),
  sendSortingReport: (from, to) => request('/reports/sorting', { method: 'POST', body: JSON.stringify({ from, to, sendEmail: true }) }),
  sendPurchasesReport: (from, to) => request('/reports/food-purchases', { method: 'POST', body: JSON.stringify({ from, to, sendEmail: true }) }),

  // Pool fish inventory
  getPoolFishInventory: () => request('/pool-fish-inventory'),

  // Pool measurements
  getPoolMeasurements: () => request('/pool-measurements'),
  getPoolMeasurementHistory: (poolNumber) => request(`/pool-measurements/history/${poolNumber}`),
  createPoolMeasurement: (data) => request('/pool-measurements', { method: 'POST', body: JSON.stringify(data) }),
  createPoolMeasurementBatch: (data) => request('/pool-measurements/batch', { method: 'POST', body: JSON.stringify(data) }),
  deletePoolMeasurement: (id) => request(`/pool-measurements/${id}`, { method: 'DELETE' }),

  // Meals (per-meal feeding)
  getMealHistory: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/meals/history?${query}`);
  },
  getMealsStatus: (date) => request(`/meals/status?date=${date}`),
  getMeals: (date) => request(`/meals?date=${date}`),
  getLastMealValues: () => request('/meals/last-values'),
  saveMeal: (data) => request('/meals', { method: 'POST', body: JSON.stringify(data) }),
  deleteMeal: (date, meal_type) => request('/meals', { method: 'DELETE', body: JSON.stringify({ date, meal_type }) }),

  // Food inventory
  getFoodInventory: () => request('/food-inventory'),
  addFoodPurchase: (data) => request('/food-inventory/purchase', { method: 'POST', body: JSON.stringify(data) }),
  updateFoodPurchase: (id, data) => request(`/food-inventory/purchase/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFoodPurchase: (id) => request(`/food-inventory/purchase/${id}`, { method: 'DELETE' }),
  getFoodInventoryLog: (days) => request(`/food-inventory/log?days=${days || 3}`),

  // AI Feeding Recommendations
  getAIRecommendations: () => request('/ai/recommendations'),
  getAIPoolRecommendation: (poolNumber) => request(`/ai/pool/${poolNumber}`),
  calculateAI: (data) => request('/ai/calculate', { method: 'POST', body: JSON.stringify(data) }),
  getWaterAnalysis: () => request('/ai/water-analysis'),
  getFeedingTable: () => request('/ai/feeding-table'),
  getStockProjection: () => request('/ai/stock-projection'),
};
