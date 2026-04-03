import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { patientAPI } from '../../services/api';
import { MdCalendarToday, MdAddCircle, MdAccessTime, MdLocalHospital, MdNotifications } from 'react-icons/md';
import { format, isToday, isFuture, parseISO, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

const STATUS_META = {
  confirmed:   { cls: 'badge-primary', label: 'Confirmed' },
  visited:     { cls: 'badge-success', label: 'Visited'   },
  cancelled:   { cls: 'badge-danger',  label: 'Cancelled' },
  not_visited: { cls: 'badge-warning', label: 'Missed'    },
  referred:    { cls: 'badge-purple',  label: 'Referred'  },
};

export default function PatientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile]     = useState(null);
  const [appointments, setApts]   = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      patientAPI.getMe(),
      patientAPI.getFollowUps().catch(() => ({ data: { followUps: [] } })),
    ]).then(([p, f]) => {
      setProfile(p.data.patient);
      setApts(p.data.appointments || []);
      setFollowUps(f.data.followUps || []);
    }).catch(() => toast.error('Failed to load dashboard'))
    .finally(() => setLoading(false));
  }, []);

  const today      = new Date().toISOString().split('T')[0];
  const upcoming   = appointments.filter(a => a.status === 'confirmed' && a.appointmentDate >= today);
  const pendingFUs = followUps.filter(f => f.status === 'pending');

  if (loading) return <div className="loading-center" style={{ minHeight: 300 }}><div className="spinner" /></div>;

  if (!profile) return (
    <div style={{ maxWidth: 460, margin: '40px auto', textAlign: 'center', padding: '0 16px' }}>
      <div style={{ fontSize: 56, marginBottom: 14 }}>👋</div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginBottom: 8 }}>Welcome to MediCare!</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 22, fontSize: 14 }}>Complete your profile to book appointments.</p>
      <button className="btn btn-primary btn-lg btn-block" onClick={() => navigate('/complete-profile')}>Complete Profile →</button>
    </div>
  );

  return (
    <div className="fade-in">
      {/* Welcome banner */}
      <div style={{ background: 'linear-gradient(135deg,#0D47A1,#1565C0)', borderRadius: 'var(--radius-lg)', padding: '20px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'white', fontSize: 22, marginBottom: 4 }}>
            Hi, {user?.name?.split(' ')[0]}! 👋
          </h1>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>
            ID: <strong style={{ color: 'white' }}>{profile?.patientId}</strong>
            {profile?.bloodGroup && <span style={{ marginLeft: 12 }}>🩸 {profile.bloodGroup}</span>}
          </p>
        </div>
        <button className="btn" onClick={() => navigate('/patient/book')} style={{ background: 'white', color: 'var(--primary)', fontWeight: 600, fontSize: 14 }}>
          <MdAddCircle size={17} /> Book
        </button>
      </div>

      {/* Pending follow-up alert */}
      {pendingFUs.length > 0 && (
        <div onClick={() => navigate('/patient/follow-ups')} style={{ background: 'var(--warning-light)', border: '1px solid #FFE082', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexWrap: 'wrap' }}>
          <div style={{ width: 38, height: 38, background: 'var(--warning)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MdNotifications size={20} color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#7B5800' }}>
              {pendingFUs.length} Follow-up{pendingFUs.length > 1 ? 's' : ''} Need Your Response
            </div>
            <div style={{ fontSize: 12, color: '#A07000' }}>
              {pendingFUs.map(f => f.doctor?.user?.name).join(', ')} recommended visits
            </div>
          </div>
          <span style={{ background: 'var(--warning)', color: 'white', borderRadius: 8, padding: '5px 12px', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>View →</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Visits',  value: appointments.length, icon: '📅', color: '#E3F0FF', onClick: () => navigate('/patient/appointments') },
          { label: 'Upcoming',      value: upcoming.length,     icon: '⏰', color: '#E8F5E9', onClick: () => navigate('/patient/appointments') },
          { label: 'Completed',     value: appointments.filter(a => a.status === 'visited').length, icon: '✅', color: '#F3E5F5' },
          { label: 'Follow-ups',    value: followUps.length,    icon: '🔄', color: pendingFUs.length ? '#FFF8E1' : '#F3E5F5', badge: pendingFUs.length || null, onClick: () => navigate('/patient/follow-ups') },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ cursor: s.onClick ? 'pointer' : 'default', position: 'relative' }} onClick={s.onClick}>
            {s.badge && <span style={{ position: 'absolute', top: 8, right: 8, background: 'var(--warning)', color: 'white', width: 18, height: 18, borderRadius: 9, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.badge}</span>}
            <div className="stat-icon" style={{ background: s.color }}><span style={{ fontSize: 18 }}>{s.icon}</span></div>
            <div className="stat-content"><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Upcoming appointments */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MdAccessTime size={17} color="var(--primary)" />
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Upcoming Appointments</h3>
            </div>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/patient/appointments')}>All</button>
          </div>
          {upcoming.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 16px' }}>
              <MdCalendarToday size={36} color="var(--border)" />
              <h3 style={{ marginTop: 10, fontSize: 15 }}>No upcoming appointments</h3>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => navigate('/patient/book')}>Book Now</button>
            </div>
          ) : upcoming.slice(0, 4).map(apt => (
            <div key={apt.id} style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, background: 'var(--primary-50)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏥</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.doctor?.user?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{apt.doctor?.department?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>📅 {format(parseISO(apt.appointmentDate), 'dd MMM')}</span>
                  <span>⏰ {apt.appointmentTime}</span>
                  <span>🎟 #{apt.tokenNumber}</span>
                </div>
              </div>
              {isToday(parseISO(apt.appointmentDate)) && <span className="badge badge-success" style={{ fontSize: 10, flexShrink: 0 }}>Today</span>}
            </div>
          ))}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Follow-ups pending box */}
          {pendingFUs.length > 0 && (
            <div className="card" style={{ border: '2px solid var(--warning)' }}>
              <div className="card-header" style={{ background: 'var(--warning-light)', padding: '12px 14px' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--warning)' }}>⏳ Pending Follow-ups ({pendingFUs.length})</span>
              </div>
              {pendingFUs.slice(0, 2).map(fu => (
                <div key={fu.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fu.doctor?.user?.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Suggested: {format(parseISO(fu.followUpDate), 'dd MMM yyyy')}
                    {differenceInDays(parseISO(fu.followUpDate), new Date()) <= 7 && (
                      <span style={{ color: 'var(--warning)', marginLeft: 8, fontWeight: 600 }}>
                        (in {differenceInDays(parseISO(fu.followUpDate), new Date())}d)
                      </span>
                    )}
                  </div>
                  {fu.followUpNotes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{fu.followUpNotes}</div>}
                </div>
              ))}
              <div style={{ padding: '10px 14px' }}>
                <button className="btn btn-block btn-sm" style={{ background: 'var(--warning)', color: 'white' }} onClick={() => navigate('/patient/follow-ups')}>
                  Respond to Follow-ups →
                </button>
              </div>
            </div>
          )}

          {/* Health Profile */}
          <div className="card">
            <div className="card-header" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MdLocalHospital size={16} color="var(--primary)" />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Health Profile</span>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('/patient/profile')}>Edit</button>
            </div>
            <div style={{ padding: '10px 14px' }}>
              {[
                ['Blood Group',  profile.bloodGroup || 'Not set'],
                ['Age',          profile.age ? `${profile.age} yrs` : 'Not set'],
                ['Gender',       profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'Not set'],
                ['Conditions',   profile.existingConditions || 'None'],
                ['Emergency',    profile.emergencyContact || 'Not set'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ fontWeight: 500, maxWidth: '60%', textAlign: 'right', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick book */}
          <div className="card">
            <div className="card-header" style={{ padding: '12px 14px' }}><span style={{ fontSize: 14, fontWeight: 600 }}>Quick Book</span></div>
            <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Orthopaedics', 'Cardiology', 'General Medicine', 'Paediatrics', 'ENT', 'Gynaecology'].map(d => (
                <button key={d} className="btn btn-sm btn-outline" onClick={() => navigate('/patient/book')} style={{ fontSize: 12 }}>{d}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent history */}
      {appointments.filter(a => a.status !== 'confirmed').length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header" style={{ padding: '12px 14px' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Recent Visits</span>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/patient/appointments')}>View All</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>ID</th><th>Doctor</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {appointments.filter(a => a.status !== 'confirmed').slice(0, 5).map(apt => {
                  const meta = STATUS_META[apt.status] || { cls: 'badge-gray', label: apt.status };
                  return (
                    <tr key={apt.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--primary)' }}>{apt.appointmentId}</td>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{apt.doctor?.user?.name}</td>
                      <td style={{ fontSize: 12 }}>{format(parseISO(apt.appointmentDate), 'dd MMM yy')}</td>
                      <td><span className={`badge ${meta.cls}`} style={{ fontSize: 11 }}>{meta.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
