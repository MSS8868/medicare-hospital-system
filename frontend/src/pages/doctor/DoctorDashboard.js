import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { appointmentAPI, doctorAPI } from '../../services/api';
import { format, parseISO } from 'date-fns';
import { MdQueueMusic, MdAccessTime, MdMedicalServices, MdPerson } from 'react-icons/md';

export default function DoctorDashboard() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [queue, setQueue]             = useState([]);
  const [upcoming, setUpcoming]       = useState([]);
  const [doctorProfile, setDocProf]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    Promise.all([
      appointmentAPI.getQueue().catch(() => ({ data: { queue: [] } })),
      appointmentAPI.getAll({ status: 'confirmed', limit: 10 }).catch(() => ({ data: { appointments: [] } })),
      doctorAPI.getMyProfile().catch(() => ({ data: { doctor: null } })),
    ]).then(([q, u, d]) => {
      setQueue(q.data.queue || []);
      setUpcoming((u.data.appointments || []).filter(a => a.appointmentDate > today));
      setDocProf(d.data.doctor);
    }).finally(() => setLoading(false));
  }, []);

  const visited = queue.filter(q => q.status === 'visited').length;
  const pending = queue.filter(q => q.status === 'confirmed').length;

  if (loading) return <div className="loading-center" style={{ minHeight: 300 }}><div className="spinner" /></div>;

  return (
    <div className="fade-in">
      {/* Banner */}
      <div style={{ background: 'linear-gradient(135deg,#1B5E20,#2E7D32)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'white', fontSize: 22, marginBottom: 3 }}>
            Good day, {user?.name?.split(' ').slice(0,2).join(' ')} 🩺
          </h1>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>
            {format(new Date(), 'EEEE, dd MMMM yyyy')}
            {doctorProfile?.department?.name && <span style={{ marginLeft: 12 }}>· {doctorProfile.department.name}</span>}
          </p>
        </div>
        <button className="btn" style={{ background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.3)', fontSize: 13 }} onClick={() => navigate('/doctor/queue')}>
          <MdQueueMusic size={16} /> Today's Queue
        </button>
      </div>

      {/* KPIs */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: "Today's", value: queue.length,   icon: '👥', color: '#E3F0FF', action: () => navigate('/doctor/queue') },
          { label: 'Pending', value: pending,          icon: '⏳', color: '#FFF8E1' },
          { label: 'Visited', value: visited,          icon: '✅', color: '#E8F5E9' },
          { label: 'Upcoming',value: upcoming.length,  icon: '📅', color: '#F3E5F5' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ cursor: s.action ? 'pointer' : 'default' }} onClick={s.action}>
            <div className="stat-icon" style={{ background: s.color }}><span style={{ fontSize: 18 }}>{s.icon}</span></div>
            <div className="stat-content"><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Queue preview */}
        <div className="card">
          <div className="card-header" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdQueueMusic color="var(--primary)" size={16} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Today's Queue</span>
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => navigate('/doctor/queue')}>Full Queue</button>
          </div>
          {queue.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <p style={{ fontSize: 14 }}>Queue is clear today</p>
            </div>
          ) : queue.slice(0, 6).map((apt, idx) => (
            <div key={apt.id} style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div className="token-badge" style={{ background: idx === 0 && apt.status === 'confirmed' ? 'var(--primary)' : 'var(--primary-50)', color: idx === 0 && apt.status === 'confirmed' ? 'white' : 'var(--primary)', fontSize: 13 }}>
                #{apt.tokenNumber}
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient?.user?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{apt.appointmentTime} · {apt.type === 'new' ? 'New' : 'F/U'}</div>
              </div>
              <span className={`badge ${apt.status === 'visited' ? 'badge-success' : 'badge-primary'}`} style={{ fontSize: 10 }}>
                {apt.status === 'visited' ? 'Done' : 'Pending'}
              </span>
              {apt.status === 'confirmed' && (
                <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, fontSize: 12, padding: '5px 10px' }} onClick={() => navigate(`/doctor/consultation/${apt.id}`)}>
                  <MdMedicalServices size={13} /> Consult
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {upcoming.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MdAccessTime color="var(--primary)" size={16} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Upcoming</span>
                </div>
              </div>
              {upcoming.slice(0, 5).map(apt => (
                <div key={apt.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, background: 'var(--purple-light)', color: 'var(--purple)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>#{apt.tokenNumber}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.patient?.user?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(parseISO(apt.appointmentDate), 'dd MMM')} · {apt.appointmentTime}</div>
                  </div>
                  <span className={`badge ${apt.type === 'new' ? 'badge-primary' : 'badge-accent'}`} style={{ fontSize: 10 }}>{apt.type === 'new' ? 'New' : 'F/U'}</span>
                </div>
              ))}
            </div>
          )}

          {doctorProfile && (
            <div className="card">
              <div className="card-header" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MdPerson color="var(--primary)" size={16} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>My Profile</span>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => navigate('/doctor/schedule')}>Schedule</button>
              </div>
              <div style={{ padding: '10px 14px' }}>
                {[
                  ['Dept',       doctorProfile.department?.name],
                  ['Speciality', doctorProfile.specialization],
                  ['Experience', `${doctorProfile.experience} yrs`],
                  ['Slot',       `${doctorProfile.slotDuration} min`],
                  ['Fee',        `₹${doctorProfile.consultationFee}`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
