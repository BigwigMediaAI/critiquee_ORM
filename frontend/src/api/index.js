import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('handleey_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('handleey_token');
      localStorage.removeItem('handleey_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (data) => api.post('/auth/login', data),
  demo: () => api.get('/auth/demo'),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

export const superAdminApi = {
  getStats: () => api.get('/super-admin/stats'),
  getClients: () => api.get('/super-admin/clients'),
  createClient: (data) => api.post('/super-admin/clients', data),
  getClient: (id) => api.get(`/super-admin/clients/${id}`),
  updateClient: (id, data) => api.put(`/super-admin/clients/${id}`, data),
  resetAdminPassword: (id, data) => api.post(`/super-admin/clients/${id}/reset-password`, data),
  getPlatforms: () => api.get('/super-admin/platforms'),
  getPlacesApiKeys: (id) => api.get(`/super-admin/clients/${id}/places-api-keys`),
  updatePlacesApiKey: (id, data) => api.put(`/super-admin/clients/${id}/places-api-key`, data),
  removePlacesApiKey: (id, branchId) => api.delete(`/super-admin/clients/${id}/places-api-key`, { params: { branch_id: branchId } }),
};

export const reviewApi = {
  getReviews: (params) => api.get('/reviews/', { params }),
  getReview: (id) => api.get(`/reviews/${id}`),
  getCounts: (params) => api.get('/reviews/counts', { params }),
  reply: (id, data) => api.post(`/reviews/${id}/reply`, data),
  markSeen: (id) => api.post(`/reviews/${id}/mark-seen`),
  assign: (id, data) => api.post(`/reviews/${id}/assign`, data),
  approveReply: (id) => api.put(`/reviews/${id}/approve-reply`),
  getPendingApprovals: (params) => api.get('/reviews/pending-approvals', { params }),
  analyzeSentiment: (params) => api.post('/reviews/analyze-sentiment', null, { params }),
};

export const socialApi = {
  getPosts: (params) => api.get('/social/posts', { params }),
  getPost: (id) => api.get(`/social/posts/${id}`),
  getCounts: (params) => api.get('/social/counts', { params }),
  createPost: (data) => api.post('/social/posts', data),
  replyToComment: (postId, cId, data) => api.post(`/social/posts/${postId}/comments/${cId}/reply`, data),
  markCommentSeen: (postId, cId) => api.post(`/social/posts/${postId}/comments/${cId}/mark-seen`),
  assignComment: (postId, cId, data) => api.post(`/social/posts/${postId}/comments/${cId}/assign`, data),
  approveCommentReply: (postId, cId) => api.put(`/social/posts/${postId}/comments/${cId}/approve-reply`),
};

export const departmentApi = {
  getDepartments: (params) => api.get('/departments/', { params }),
  createDepartment: (data) => api.post('/departments', data),
  updateDepartment: (id, data) => api.put(`/departments/${id}`, data),
  deleteDepartment: (id) => api.delete(`/departments/${id}`),
  getDeptUsers: (id) => api.get(`/departments/${id}/users`),
  createDeptUser: (id, data) => api.post(`/departments/${id}/users`, data),
  resetDeptUserPassword: (dId, uId, data) => api.post(`/departments/${dId}/users/${uId}/reset-password`, data),
  getAssignments: () => api.get('/departments/assignments/list'),
};

export const aiApi = {
  suggestReply: (data) => api.post('/ai/suggest-reply', data),
  generateImage: (data) => api.post('/ai/generate-image', data, { timeout: 120000 }),
  composePost: (data) => api.post('/ai/compose-post', data, { timeout: 60000 }),
};

export const settingsApi = {
  getSettings: (params) => api.get('/settings/', { params }),
  updateSettings: (data, params) => api.put('/settings/', data, { params }),
  getPlatforms: (params) => api.get('/settings/platforms', { params }),
  connectPlatform: (p, params) => api.post(`/settings/platforms/${p}/connect`, {}, { params }),
  disconnectPlatform: (p, params) => api.post(`/settings/platforms/${p}/disconnect`, {}, { params }),
};

export const reportsApi = {
  getSummary: (params) => api.get('/reports/summary', { params }),
  getTrends: (days, params) => api.get('/reports/trends', { params: { days, ...params } }),
  getAuditLogs: (params) => api.get('/reports/audit-logs', { params }),
  exportReviews: (params) => api.get('/reports/export/reviews', { params, responseType: 'blob' }),
  exportComments: (params) => api.get('/reports/export/comments', { params, responseType: 'blob' }),
  exportAuditLogs: (params) => api.get('/reports/export/audit-logs', { params, responseType: 'blob' }),
  exportSummary: (params) => api.get('/reports/export/summary', { params, responseType: 'blob' }),
};

export const branchApi = {
  getBranches: () => api.get('/branches/'),
  createBranch: (data) => api.post('/branches/', data),
  updateBranch: (id, data) => api.put(`/branches/${id}`, data),
  deleteBranch: (id) => api.delete(`/branches/${id}`),
};

export const platformApi = {
  getConfigs: () => api.get('/platforms/configs'),
  getCredentials: (params) => api.get('/platforms/credentials', { params }),
  saveCredentials: (data, params) => api.post('/platforms/credentials', data, { params }),
  deleteCredentials: (platform, params) => api.delete(`/platforms/credentials/${platform}`, { params }),
  getOAuthUrl: (platform, params) => api.get(`/platforms/oauth/url/${platform}`, { params }),
  handleOAuthCallback: (params) => api.post('/platforms/oauth/callback', null, { params }),
  refreshToken: (platform, params) => api.post(`/platforms/oauth/refresh/${platform}`, null, { params }),
  getConnection: (platform, params) => api.get(`/platforms/connection/${platform}`, { params }),
};

export const syncApi = {
  testConnection: (platform, params) => api.get(`/sync/test/${platform}`, { params }),
  syncPlatform: (platform, params) => api.post(`/sync/sync/${platform}`, null, { params }),
  getSyncStatus: (params) => api.get('/sync/status', { params }),
};

export const scheduledPostsApi = {
  getPosts: (params) => api.get('/scheduled-posts/', { params }),
  getPost: (id) => api.get(`/scheduled-posts/${id}`),
  createPost: (data) => api.post('/scheduled-posts/', data),
  updatePost: (id, data) => api.put(`/scheduled-posts/${id}`, data),
  deletePost: (id) => api.delete(`/scheduled-posts/${id}`),
  publishNow: (id) => api.post(`/scheduled-posts/${id}/publish-now`),
};

const uploadApi_instance = axios.create({
  baseURL: `${API_URL}/api`,
});
uploadApi_instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('handleey_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const uploadApi = {
  uploadImages: (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return uploadApi_instance.post('/uploads/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const seedApi = {
  seedDemoData: (params) => api.post('/seed/demo-data', null, { params }),
  clearDemoData: (params) => api.delete('/seed/demo-data', { params }),
};

export const notificationApi = {
  getAll: (params) => api.get('/notifications/', { params }),
  getUnreadCount: (params) => api.get('/notifications/unread-count', { params }),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: (params) => api.post('/notifications/read-all', null, { params }),
};

export const gmbApi = {
  saveApiKey: (data, params) => api.post('/gmb/api-key', data, { params }),
  getStatus: (params) => api.get('/gmb/status', { params }),
  search: (data, params) => api.post('/gmb/search', data, { params }),
  selectBusiness: (data, params) => api.post('/gmb/select', data, { params }),
  removeBusiness: (params) => api.delete('/gmb/business', { params }),
  getReviewStats: (params) => api.get('/gmb/review-stats', { params }),
  getAllReviews: (params) => api.get('/gmb/all-reviews', { params }),
  getGoogleOAuthStatus: (params) => api.get('/gmb/google-oauth-status', { params }),
  syncReviews: (params) => api.post('/gmb/sync-reviews', null, { params }),
  getCompetitors: (params) => api.get('/gmb/competitors', { params }),
  getPerformance: (params) => api.get('/gmb/performance', { params }),
  getInsights: (params) => api.get('/gmb/insights', { params }),
  runSentiment: (params) => api.post('/gmb/sentiment', null, { params }),
  getSentiment: (params) => api.get('/gmb/sentiment', { params }),
};

export const reviewLinkApi = {
  getSettings: (params) => api.get('/review-link/settings', { params }),
  updateSettings: (data, params) => api.put('/review-link/settings', data, { params }),
  getSubmissions: (params) => api.get('/review-link/submissions', { params }),
  exportSubmissions: (params) => api.get('/review-link/submissions/export', { params, responseType: 'blob' }),
  getPlatformOptions: () => api.get('/review-link/platform-options'),
  getPlatformCategories: () => api.get('/review-link/platform-categories'),
  getCustomPlatforms: (params) => api.get('/review-link/custom-platforms', { params }),
  addCustomPlatform: (data, params) => api.post('/review-link/custom-platforms', data, { params }),
  deleteCustomPlatform: (id) => api.delete(`/review-link/custom-platforms/${id}`),
};

export const eventApi = {
  list: (params) => api.get('/events/', { params }),
  create: (data) => api.post('/events/', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  remove: (id) => api.delete(`/events/${id}`),
  getRegistrations: (id) => api.get(`/events/${id}/registrations`),
  exportEvents: (params) => api.get('/events/export/csv', { params, responseType: 'blob' }),
  exportRegistrations: (id) => api.get(`/events/${id}/registrations/export`, { responseType: 'blob' }),
  publicInfo: (id) => api.get(`/events/public/${id}`),
  publicRegister: (id, data) => api.post(`/events/public/${id}/register`, data),
};
