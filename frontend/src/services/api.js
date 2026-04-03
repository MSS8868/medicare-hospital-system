/**
 * services/api.js
 *
 * Axios instance + all API method wrappers.
 *
 * BASE URL priority:
 *   1. REACT_APP_API_URL environment variable (set this in Vercel / Railway)
 *   2. http://localhost:5000/api (local development fallback)
 *
 * No hardcoded Railway URL — configure via env var instead.
 */

import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
});

// Attach JWT token to every request automatically
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto-logout on 401 (expired / invalid token)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  sendOTP:        (mobile)          => api.post('/auth/send-otp',         { mobile }),
  verifyOTP:      (mobile, otp)     => api.post('/auth/verify-otp',       { mobile, otp }),
  login:          (mobile, password)=> api.post('/auth/login',            { mobile, password }),
  getMe:          ()                => api.get ('/auth/me'),
  completeProfile:(data)            => api.post('/auth/complete-profile', data),
};

// ── DEPARTMENTS ───────────────────────────────────────────────────────────────
export const deptAPI = {
  getAll: () => api.get('/departments'),
};

// ── DOCTORS ───────────────────────────────────────────────────────────────────
export const doctorAPI = {
  getAll:           (params)  => api.get('/doctors',              { params }),
  getById:          (id)      => api.get(`/doctors/${id}`),
  getMyProfile:     ()        => api.get('/doctors/me'),
  getMySchedule:    ()        => api.get('/doctors/me/schedule'),
  updateMySchedule: (scheds)  => api.put('/doctors/me/schedule',  { schedules: scheds }),
  getSchedule:      (id)      => api.get(`/doctors/${id}/schedule`),
  create:           (data)    => api.post('/doctors',             data),

  // Date overrides — single-day schedule extensions
  getMyOverrides:   (params)  => api.get('/doctors/me/overrides', { params }),
  upsertOverride:   (data)    => api.post('/doctors/me/overrides', data),
  deleteOverride:   (date)    => api.delete(`/doctors/me/overrides/${date}`),
};

// ── APPOINTMENTS ──────────────────────────────────────────────────────────────
export const appointmentAPI = {
  // getSlots returns ALL slots (available + booked + locked) for visual display
  // Pass onlyAvailable=true to get only bookable slots
  getSlots:     (doctorId, date, onlyAvailable) =>
    api.get('/appointments/slots', { params: { doctorId, date, ...(onlyAvailable && { onlyAvailable: 'true' }) } }),

  lockSlot:     (slotId)             => api.post('/appointments/lock-slot', { slotId }),
  book:         (data)               => api.post('/appointments',            data),
  getAll:       (params)             => api.get('/appointments',             { params }),
  getQueue:     (params)             => api.get('/appointments/queue',       { params }),
  getById:      (id)                 => api.get(`/appointments/${id}`),
  updateStatus: (id, status, reason) => api.patch(`/appointments/${id}/status`, { status, cancelReason: reason }),
  downloadPDF:  (id)                 => api.get(`/appointments/${id}/pdf`, { responseType: 'blob' }),
};

// ── CONSULTATIONS ─────────────────────────────────────────────────────────────
export const consultationAPI = {
  get:                  (aptId)           => api.get(`/consultations/${aptId}`),
  save:                 (aptId, data)     => api.post(`/consultations/${aptId}`, data),
  processAI:            (text, patientId) => api.post('/consultations/ai/process', { text, patientId }),
  getPatientHistory:    (patientId)       => api.get(`/patients/${patientId}/history`),
  downloadPrescription: (aptId)           => api.get(`/consultations/${aptId}/prescription`, { responseType: 'blob' }),
};

// ── PATIENTS ──────────────────────────────────────────────────────────────────
export const patientAPI = {
  getMe:           ()           => api.get('/patients/me'),
  update:          (data)       => api.put('/patients/me', data),
  search:          (params)     => api.get('/patients/search', { params }),
  getById:         (id)         => api.get(`/patients/${id}`),
  getFollowUps:    ()           => api.get('/patients/follow-ups'),
  respondFollowUp: (id, data)   => api.patch(`/patients/follow-ups/${id}`, data),
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
export const notificationAPI = {
  getAll:    ()       => api.get('/notifications'),
  markRead:  (ids)    => api.patch('/notifications/read', { ids }),  // ids = array or 'all'
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────
export const adminAPI = {
  getAnalytics: () => api.get('/admin/analytics'),
};

// ── UTILITIES ─────────────────────────────────────────────────────────────────
/** Trigger browser download from a blob response */
export function downloadBlob(res, filename) {
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default api;
