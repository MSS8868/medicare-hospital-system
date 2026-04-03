import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, doctorAPI, appointmentAPI } from '../../services/api';
import { format, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MdMedicalServices, MdCalendarToday, MdTrendingUp, MdPeople } from 'react-icons/md';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [doctors, setDoctors]     = useState([]);
  const [recentApts, setRecent]   = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      adminAPI.getAnalytics().catch(() => ({ data: { analytics: {} } })),
      doctorAPI.getAll().catch(() => ({ data: { doctors: [] } })),
      appointmentAPI.getAll({ limit: 10 }).catch(() => ({ data: { appointments: [] } })),
    ]).then(([a, d, apt]) => {
      setAnalytics(a.data.analytics || {});
      setDoctors(d.data.doctors || []);
      setRecent(apt.data.appointments || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center" style={{ minHeight: 300 }}><div className="spinner" /></div>;

  const stats = analytics || {};

  // Dept breakdown
  const deptCounts = {};
  doctors.forEach(d => {
    const name = d.department?.name || 'Other';
    deptCounts[name] = (deptCounts[name] || 0) + 1;
  });
  const barData = Object.entries(deptCounts)
    .map(([name, count]) => ({ name: name.length > 10 ? name.slice(0, 10) + '…' : name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  const pieData = [
    { name: 'Active', value: Math.max(0, (stats.totalAppointments || 0) - (stats.cancelledAppointments || 0) - (stats.todayAppointments || 0)), color: '#0D47A1' },
    { name: 'Today',  value: stats.todayAppointments || 0, color: '#00BFA5' },
    { name: 'Cancelled', value: stats.cancelledAppointments || 0, color: '#E53935' },
  ].filter(d => d.value > 0);

  const STATUS_MAP = {
    confirmed:   { cls: 'badge-primary', label: 'Confirmed'   },
    visited:     { cls: 'badge-success', label: 'Visited'     },
    cancelled:   { cls: 'badge-danger',  label: 'Cancelled'   },
    not_visited: { cls: 'badge-warning', label: 'Missed'      },
    referred:    { cls: 'badge-purple',  label: 'Referred'    },
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#B71C1C,#E53935)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', color: 'white', fontSize: 22 }}>Admin Dashboard</h1>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 13 }}>{format(new Date(), 'EEEE, dd MMMM yyyy')} · MediCare Hospital</p>
        </div>
        <button className="btn" style={{ background: 'white', color: '#B71C1C', fontWeight: 600, fontSize: 13 }} onClick={() => navigate('/admin/doctors')}>
          <MdMedicalServices size={16} /> Manage Doctors
        </button>
      </div>

      {/* KPIs */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Appointments', value: stats.totalAppointments || 0,   icon: <MdCalendarToday />, color: '#E3F0FF' },
          { label: "Today's",            value: stats.todayAppointments || 0,    icon: <MdTrendingUp />,    color: '#E8F5E9' },
          { label: 'Total Patients',     value: stats.totalPatients || 0,        icon: <MdPeople />,        color: '#F3E5F5' },
          { label: 'Cancellation Rate',  value: `${stats.cancellationRate || 0}%`, icon: '📉',             color: '#FFEBEE' },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.color, color: 'var(--primary)' }}>
              {typeof s.icon === 'string' ? <span style={{ fontSize: 20 }}>{s.icon}</span> : s.icon}
            </div>
            <div className="stat-content">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="card-header" style={{ padding: '12px 16px' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Doctors by Department</span>
          </div>
          <div style={{ padding: '12px 8px', overflowX: 'auto' }}>
            <div style={{ minWidth: 280 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF2FF" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8FA3B8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#8FA3B8' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#0D47A1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ padding: '12px 16px' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Appointment Status</span>
          </div>
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                  {pieData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-muted)' }}>{d.name}: <strong style={{ color: 'var(--text-primary)' }}>{d.value}</strong></span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '30px 0' }}><p>No appointment data yet</p></div>
            )}
          </div>
        </div>
      </div>

      {/* Doctors table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Active Doctors ({doctors.length})</span>
          <button className="btn btn-sm btn-primary" onClick={() => navigate('/admin/doctors')}>Manage All</button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Doctor</th><th>Department</th><th>Specialization</th><th>Exp</th><th>Fee</th><th>Status</th></tr>
            </thead>
            <tbody>
              {doctors.slice(0, 8).map(doc => (
                <tr key={doc.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: 'var(--primary-50)', color: 'var(--primary)', flexShrink: 0 }}>
                        {doc.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap' }}>{doc.user?.name}</div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>{doc.department?.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.specialization}</td>
                  <td style={{ fontSize: 12 }}>{doc.experience}y</td>
                  <td style={{ fontSize: 12, fontWeight: 500 }}>₹{doc.consultationFee}</td>
                  <td><span className={`badge ${doc.isAvailable ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: 10 }}>{doc.isAvailable ? 'Active' : 'Off'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent appointments */}
      <div className="card">
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Recent Appointments</span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>ID</th><th>Patient</th><th>Doctor</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {recentApts.map(apt => {
                const meta = STATUS_MAP[apt.status] || { cls: 'badge-gray', label: apt.status };
                return (
                  <tr key={apt.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--primary)' }}>{apt.appointmentId}</td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{apt.patient?.user?.name}</td>
                    <td style={{ fontSize: 12 }}>{apt.doctor?.user?.name}</td>
                    <td style={{ fontSize: 12 }}>{apt.appointmentDate}</td>
                    <td><span className={`badge ${meta.cls}`} style={{ fontSize: 10, textTransform: 'capitalize' }}>{meta.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recentApts.length === 0 && <div className="empty-state" style={{ padding: 28 }}><p>No appointments yet</p></div>}
        </div>
      </div>
    </div>
  );
}
