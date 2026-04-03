import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { appointmentAPI } from '../../services/api';
import { format, parseISO } from 'date-fns';
import { MdAddCircle, MdRefresh, MdSearch } from 'react-icons/md';

const STATUS_META = {
  confirmed:   { cls: 'badge-primary', label: 'Confirmed'  },
  visited:     { cls: 'badge-success', label: 'Visited'    },
  cancelled:   { cls: 'badge-danger',  label: 'Cancelled'  },
  not_visited: { cls: 'badge-warning', label: 'Missed'     },
  referred:    { cls: 'badge-purple',  label: 'Referred'   },
  admitted:    { cls: 'badge-accent',  label: 'Admitted'   },
};

export default function ReceptionistDashboard() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const today = format(new Date(), 'yyyy-MM-dd');

  const load = () => {
    setLoading(true);
    appointmentAPI.getAll({ date: today, limit: 100 })
      .then(r => setAppointments(r.data.appointments || []))
      .catch(() => toast.error('Failed to load appointments'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = appointments.filter(a => {
    // Search filter
    if (search) {
      const s = search.toLowerCase();
      const matchesSearch = (
        a.patient?.user?.name?.toLowerCase().includes(s) ||
        a.patient?.user?.mobile?.includes(s) ||
        a.doctor?.user?.name?.toLowerCase().includes(s) ||
        a.appointmentId?.toLowerCase().includes(s)
      );
      if (!matchesSearch) return false;
    }

    // Department filter
    if (selectedDept && a.doctor?.department?.name !== selectedDept) return false;

    // Status filter - visited vs not visited
    if (selectedStatus === 'visited' && a.status !== 'visited') return false;
    if (selectedStatus === 'not_visited' && (a.status === 'visited' || a.status === 'cancelled')) return false;

    return true;
  });

  const stats = {
    total:     appointments.length,
    confirmed: appointments.filter(a => a.status === 'confirmed').length,
    visited:   appointments.filter(a => a.status === 'visited').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  };

  return (
    <div className="fade-in">
      {/* Header banner */}
      <div style={{ background: 'linear-gradient(135deg, #E65100, #FB8C00)', borderRadius: 16, padding: '20px 24px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', color: 'white', fontSize: 22 }}>Reception Desk</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
            {format(new Date(), 'EEEE, dd MMMM yyyy')}
          </p>
        </div>
        <button
          className="btn"
          style={{ background: 'white', color: '#E65100', fontWeight: 600 }}
          onClick={() => navigate('/receptionist/walk-in')}
        >
          <MdAddCircle size={18} /> Walk-in Booking
        </button>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: "Today's Total", value: stats.total,     icon: '📅', color: '#FFF3E0' },
          { label: 'Confirmed',     value: stats.confirmed, icon: '✅', color: '#E8F5E9' },
          { label: 'Visited',       value: stats.visited,   icon: '🏥', color: '#E3F0FF' },
          { label: 'Cancelled',     value: stats.cancelled, icon: '❌', color: '#FFEBEE' },
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

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Today's Appointments</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <MdSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 16 }} />
              <input
                className="form-control"
                style={{ paddingLeft: 32, width: 200, padding: '7px 10px 7px 32px', fontSize: 13 }}
                placeholder="Search patient, doctor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              style={{ width: 150, padding: '7px 10px', fontSize: 13 }}
            >
              <option value="">All Departments</option>
              {[...new Set(appointments.map(a => a.doctor?.department?.name).filter(Boolean))].sort().map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <select
              className="form-control"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              style={{ width: 140, padding: '7px 10px', fontSize: 13 }}
            >
              <option value="">All Status</option>
              <option value="visited">✅ Visited</option>
              <option value="not_visited">⏳ Not Visited</option>
            </select>
            <button className="btn btn-sm btn-outline" onClick={load} disabled={loading}>
              <MdRefresh size={14} /> {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Patient</th>
                <th>Mobile</th>
                <th>Doctor</th>
                <th>Dept</th>
                <th>Time</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : filtered.map(apt => {
                const meta = STATUS_META[apt.status] || { cls: 'badge-gray', label: apt.status };
                return (
                  <tr key={apt.id}>
                    <td>
                      <span className="badge badge-primary" style={{ fontWeight: 700, fontSize: 13 }}>#{apt.tokenNumber}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{apt.patient?.user?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{apt.appointmentId}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{apt.patient?.user?.mobile}</td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{apt.doctor?.user?.name}</td>
                    <td>
                      <span className="badge badge-primary" style={{ fontSize: 10, background: 'var(--primary-50)', color: 'var(--primary)' }}>
                        {apt.doctor?.department?.name}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{apt.appointmentTime}</td>
                    <td>
                      <span className={`badge ${apt.type === 'new' ? 'badge-accent' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                        {apt.type === 'new' ? 'New' : 'F/U'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${meta.cls}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="empty-state" style={{ padding: 36 }}>
              <p>{search ? `No results for "${search}"` : 'No appointments today'}</p>
            </div>
          )}
        </div>
        {filtered.length > 0 && (
          <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Showing {filtered.length} of {appointments.length} appointments
          </div>
        )}
      </div>
    </div>
  );
}
