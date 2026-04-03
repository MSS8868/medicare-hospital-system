import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { appointmentAPI } from '../../services/api';
import { MdRefresh, MdMedicalServices, MdPhone } from 'react-icons/md';

const STATUS_OPTIONS = [
  { val: 'visited',     label: '✅ Visited'    },
  { val: 'not_visited', label: '❌ Missed'     },
  { val: 'referred',    label: '🔄 Referred'   },
  { val: 'admitted',    label: '🏥 Admitted'   },
];

export default function DoctorQueue() {
  const navigate      = useNavigate();
  const [queue, setQueue]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [updating, setUpdating] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    appointmentAPI.getQueue()
      .then(r => setQueue(r.data.queue || []))
      .catch(() => toast.error('Failed to load queue'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleStatus = async (apt, status) => {
    setUpdating(apt.id);
    try {
      await appointmentAPI.updateStatus(apt.id, status);
      setQueue(q => q.map(a => a.id === apt.id ? { ...a, status } : a));
      toast.success(`Marked as ${status.replace('_', ' ')}`);
    } catch { toast.error('Failed to update status'); }
    finally { setUpdating(null); }
  };

  const pending = queue.filter(q => q.status === 'confirmed');
  const done    = queue.filter(q => q.status !== 'confirmed');

  if (loading) return <div className="loading-center" style={{ minHeight: 300 }}><div className="spinner" /></div>;

  return (
    <div className="fade-in">
      <div className="page-header-row">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Today's Queue</h1>
          <p>{format(new Date(), 'EEEE, dd MMMM yyyy')} · {queue.length} patients</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}><MdRefresh size={15} /> Refresh</button>
      </div>

      {/* Summary */}
      <div className="grid-4" style={{ margin: '16px 0' }}>
        {[
          { label: 'Total',   value: queue.length,                                    color: 'var(--primary-50)'   },
          { label: 'Pending', value: pending.length,                                  color: 'var(--warning-light)' },
          { label: 'Visited', value: done.filter(q => q.status==='visited').length,  color: 'var(--success-light)' },
          { label: 'Missed',  value: done.filter(q => q.status==='not_visited').length, color: 'var(--danger-light)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.color }}><span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-secondary)' }}>{s.value}</span></div>
            <div className="stat-content"><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ background: 'linear-gradient(to right, var(--warning-light), #FFFDE7)', padding: '12px 16px' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#7B5800' }}>⏳ Waiting — {pending.length} patient{pending.length > 1 ? 's' : ''}</span>
          </div>
          {pending.map((apt, idx) => (
            <div key={apt.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                <div className="token-badge" style={{ background: idx === 0 ? 'var(--primary)' : 'var(--primary-50)', color: idx === 0 ? 'white' : 'var(--primary)', width: 44, height: 44, fontSize: 15, flexShrink: 0 }}>
                  #{apt.tokenNumber}
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{apt.patient?.user?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                    <span>⏰ {apt.appointmentTime}</span>
                    <span>{apt.type === 'new' ? '🆕 New' : '🔄 Follow-up'}</span>
                    {apt.patient?.user?.mobile && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MdPhone size={11} />{apt.patient.user.mobile}</span>}
                  </div>
                </div>
                {idx === 0 && <span style={{ background: 'var(--primary)', color: 'white', fontSize: 11, padding: '3px 10px', borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>Current</span>}
              </div>
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: '1 1 auto', minWidth: 140 }}
                  onClick={() => navigate(`/doctor/consultation/${apt.id}`)}
                  disabled={updating === apt.id}
                >
                  <MdMedicalServices size={14} /> Open Consultation
                </button>
                {STATUS_OPTIONS.map(s => (
                  <button key={s.val}
                    className="btn btn-sm btn-outline"
                    style={{ flex: '0 0 auto', fontSize: 12, padding: '6px 10px' }}
                    disabled={updating === apt.id}
                    onClick={() => handleStatus(apt, s.val)}>
                    {updating === apt.id ? '...' : s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ background: 'var(--success-light)', padding: '12px 16px' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>✅ Completed — {done.length}</span>
          </div>
          {done.map(apt => (
            <div key={apt.id} style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, opacity: .8, flexWrap: 'wrap' }}>
              <div className="token-badge" style={{ background: 'var(--success-light)', color: 'var(--success)', width: 36, height: 36, fontSize: 12, flexShrink: 0 }}>
                #{apt.tokenNumber}
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{apt.patient?.user?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{apt.appointmentTime}</div>
              </div>
              <span className={`badge ${apt.status === 'visited' ? 'badge-success' : apt.status === 'not_visited' ? 'badge-danger' : apt.status === 'referred' ? 'badge-purple' : 'badge-accent'}`} style={{ fontSize: 11, textTransform: 'capitalize', flexShrink: 0 }}>
                {apt.status.replace('_', ' ')}
              </span>
              {apt.status === 'visited' && (
                <button className="btn btn-sm btn-outline" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => navigate(`/doctor/consultation/${apt.id}`)}>
                  Notes
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {queue.length === 0 && (
        <div className="card">
          <div className="empty-state" style={{ padding: '50px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3>Queue is clear!</h3>
            <p>No patients scheduled for today</p>
          </div>
        </div>
      )}
    </div>
  );
}
