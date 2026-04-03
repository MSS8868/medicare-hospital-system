import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, parseISO, isPast, isFuture, differenceInDays } from 'date-fns';
import { patientAPI, appointmentAPI } from '../../services/api';
import { MdCheckCircle, MdCancel, MdEventAvailable, MdRefresh, MdSchedule } from 'react-icons/md';

const STATUS_META = {
  pending:     { cls: 'badge-warning',  label: '⏳ Awaiting Response', color: 'var(--warning)' },
  accepted:    { cls: 'badge-success',  label: '✅ Accepted',           color: 'var(--success)' },
  rejected:    { cls: 'badge-danger',   label: '❌ Declined',            color: 'var(--danger)'  },
  rescheduled: { cls: 'badge-accent',   label: '🔄 Reschedule Requested', color: 'var(--accent)' },
  booked:      { cls: 'badge-primary',  label: '📅 Appointment Booked', color: 'var(--primary)' },
};

export default function FollowUps() {
  const navigate = useNavigate();
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(null);
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleNote, setRescheduleNote] = useState('');

  const load = () => {
    setLoading(true);
    patientAPI.getFollowUps()
      .then(r => setFollowUps(r.data.followUps || []))
      .catch(err => toast.error('Failed to load follow-ups: ' + (err.response?.data?.message || err.message)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const respond = async (followUp, action, extra = {}) => {
    setResponding(followUp.id);
    try {
      await patientAPI.respondFollowUp(followUp.id, { action, ...extra });
      const msgs = {
        accept: '✅ Follow-up accepted. Please book the appointment.',
        reject: 'Follow-up declined.',
        reschedule: '🔄 Reschedule request sent to doctor.',
      };
      toast.success(msgs[action] || 'Response saved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to respond');
    } finally {
      setResponding(null);
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleDate) return toast.error('Please select a preferred date');
    await respond(rescheduleModal, 'reschedule', { rescheduleDate, response: rescheduleNote });
    setRescheduleModal(null);
    setRescheduleDate('');
    setRescheduleNote('');
  };

  const handleBookFollowUp = (fu) => {
    navigate('/patient/book', { state: { prefillDoctorId: fu.doctorId, prefillType: 'follow_up' } });
  };

  const pending = followUps.filter(f => f.status === 'pending');
  const others  = followUps.filter(f => f.status !== 'pending');

  if (loading) return (
    <div className="loading-center">
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>Loading follow-ups...</p>
    </div>
  );

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fade-in">
      <div className="page-header-row">
        <div className="page-header">
          <h1>Follow-up Appointments</h1>
          <p>Doctor-recommended follow-up visits — accept, decline or request a different date</p>
        </div>
        <button className="btn btn-outline" onClick={load}>
          <MdRefresh size={16} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total',    value: followUps.length,                                 icon: '📋', color: 'var(--primary-50)'   },
          { label: 'Pending',  value: pending.length,                                   icon: '⏳', color: 'var(--warning-light)' },
          { label: 'Accepted', value: followUps.filter(f => f.status === 'accepted').length, icon: '✅', color: 'var(--success-light)' },
          { label: 'Upcoming', value: followUps.filter(f => f.followUpDate >= today && f.status !== 'rejected').length, icon: '📅', color: 'var(--purple-light)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.color }}><span style={{ fontSize: 20 }}>{s.icon}</span></div>
            <div className="stat-content">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* PENDING — needs action */}
      {pending.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: 'var(--warning)', color: 'white', borderRadius: 6, padding: '2px 8px', fontSize: 13 }}>{pending.length}</span>
            Action Required
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {pending.map(fu => {
              const daysUntil = differenceInDays(parseISO(fu.followUpDate), new Date());
              const isUrgent = daysUntil <= 3 && daysUntil >= 0;
              return (
                <div key={fu.id} className="card" style={{ overflow: 'hidden', border: isUrgent ? '2px solid var(--warning)' : '1px solid var(--border)' }}>
                  {isUrgent && (
                    <div style={{ background: 'var(--warning)', color: 'white', padding: '6px 16px', fontSize: 12, fontWeight: 600 }}>
                      ⚠️ Urgent — Follow-up date is in {daysUntil === 0 ? 'today' : `${daysUntil} day${daysUntil > 1 ? 's' : ''}`}
                    </div>
                  )}
                  <div style={{ padding: '20px 22px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <div className="avatar" style={{ width: 48, height: 48, fontSize: 15, background: 'var(--primary-50)', color: 'var(--primary)', flexShrink: 0 }}>
                          {fu.doctor?.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{fu.doctor?.user?.name}</div>
                          <div style={{ fontSize: 13, color: 'var(--primary)' }}>{fu.doctor?.department?.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fu.consultation?.visitDate ? `Last visit: ${format(parseISO(fu.consultation.visitDate), 'dd MMM yyyy')}` : ''}</div>
                        </div>
                      </div>
                      <span className={`badge ${STATUS_META[fu.status]?.cls}`}>{STATUS_META[fu.status]?.label}</span>
                    </div>

                    {/* Follow-up date */}
                    <div style={{ background: 'var(--primary-50)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Recommended Follow-up Date</div>
                          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--primary)', marginTop: 2 }}>
                            📅 {format(parseISO(fu.followUpDate), 'EEEE, dd MMMM yyyy')}
                          </div>
                        </div>
                        {fu.consultation?.diagnosis && (
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>For Diagnosis</div>
                            <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{fu.consultation.diagnosis}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Doctor's follow-up notes */}
                    {fu.followUpNotes && (
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--text-secondary)', borderLeft: '3px solid var(--primary)' }}>
                        <strong>Doctor's Note:</strong> {fu.followUpNotes}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'var(--success)', color: 'white', flex: '1', minWidth: 140 }}
                        onClick={() => respond(fu, 'accept')}
                        disabled={responding === fu.id}
                      >
                        <MdCheckCircle size={15} />
                        {responding === fu.id ? 'Saving...' : 'Accept Follow-up'}
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ flex: '1', minWidth: 140 }}
                        onClick={() => { setRescheduleModal(fu); setRescheduleDate(fu.followUpDate); }}
                        disabled={responding === fu.id}
                      >
                        <MdSchedule size={15} /> Request Different Date
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        style={{ flex: '1', minWidth: 140 }}
                        onClick={() => respond(fu, 'reject')}
                        disabled={responding === fu.id}
                      >
                        <MdCancel size={15} /> Decline
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Accepted — book appointment */}
      {followUps.filter(f => f.status === 'accepted').length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>📅 Accepted — Book Your Appointment</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {followUps.filter(f => f.status === 'accepted').map(fu => (
              <div key={fu.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div className="avatar" style={{ width: 44, height: 44, fontSize: 14, background: 'var(--success-light)', color: 'var(--success)', flexShrink: 0 }}>
                  {fu.doctor?.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fu.doctor?.user?.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Follow-up by: {format(parseISO(fu.followUpDate), 'dd MMM yyyy')}
                  </div>
                </div>
                <span className="badge badge-success">Accepted</span>
                <button className="btn btn-primary btn-sm" onClick={() => handleBookFollowUp(fu)}>
                  Book Now →
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* History */}
      {others.filter(f => f.status !== 'accepted').length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-muted)' }}>History</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {others.filter(f => f.status !== 'accepted').map(fu => (
              <div key={fu.id} className="card" style={{ padding: '14px 18px', opacity: 0.75, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div className="avatar" style={{ width: 38, height: 38, fontSize: 13, background: 'var(--border)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {fu.doctor?.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fu.doctor?.user?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {format(parseISO(fu.followUpDate), 'dd MMM yyyy')}
                    {fu.rescheduleDate && ` → Requested: ${format(parseISO(fu.rescheduleDate), 'dd MMM yyyy')}`}
                  </div>
                </div>
                <span className={`badge ${STATUS_META[fu.status]?.cls}`} style={{ fontSize: 11 }}>
                  {STATUS_META[fu.status]?.label}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {followUps.length === 0 && (
        <div className="card">
          <div className="empty-state" style={{ padding: 60 }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🩺</div>
            <h3>No follow-ups yet</h3>
            <p>When a doctor recommends a follow-up visit, it will appear here</p>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <div className="modal-overlay" onClick={() => setRescheduleModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Request Different Date</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setRescheduleModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
                Doctor recommended: <strong>{rescheduleModal.followUpDate && format(parseISO(rescheduleModal.followUpDate), 'dd MMM yyyy')}</strong>.
                Please select your preferred alternative date.
              </p>
              <div className="form-group">
                <label className="form-label required">Your Preferred Date</label>
                <input
                  type="date"
                  className="form-control"
                  min={today}
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reason / Note (optional)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="e.g. I have travel plans on the recommended date"
                  value={rescheduleNote}
                  onChange={e => setRescheduleNote(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRescheduleModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRescheduleSubmit}>
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
