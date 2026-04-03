import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { doctorAPI, deptAPI } from '../../services/api';
import { MdAdd, MdEdit, MdSearch } from 'react-icons/md';

export default function ManageDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '', mobile: '', email: '', password: 'Doctor@123',
    departmentId: '', specialization: '', qualification: '',
    experience: '', bio: '', consultationFee: 500, slotDuration: 15,
  });
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([doctorAPI.getAll(), deptAPI.getAll()])
      .then(([d, dept]) => { setDoctors(d.data.doctors || []); setDepartments(dept.data.departments || []); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.mobile || !form.departmentId) return toast.error('Name, mobile and department are required');
    setSaving(true);
    try {
      await doctorAPI.create(form);
      toast.success('Doctor added successfully');
      setShowModal(false);
      setForm({ name: '', mobile: '', email: '', password: 'Doctor@123', departmentId: '', specialization: '', qualification: '', experience: '', bio: '', consultationFee: 500, slotDuration: 15 });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add doctor'); }
    finally { setSaving(false); }
  };

  const filtered = doctors.filter(d =>
    d.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.department?.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.specialization?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="fade-in">
      <div className="page-header-row">
        <div className="page-header"><h1>Manage Doctors</h1><p>{doctors.length} doctors registered</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><MdAdd /> Add Doctor</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <MdSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-control" style={{ paddingLeft: 36 }} placeholder="Search doctors..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Doctor</th><th>Department</th><th>Qualification</th><th>Exp</th><th>Fee</th><th>Slot</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(doc => (
                <tr key={doc.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 36, height: 36, fontSize: 13, background: 'var(--primary-50)', color: 'var(--primary)', flexShrink: 0 }}>
                        {doc.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{doc.user?.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doc.specialization}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge badge-primary" style={{ fontSize: 11 }}>{doc.department?.name}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 160 }}>{doc.qualification}</td>
                  <td style={{ fontSize: 13 }}>{doc.experience} yrs</td>
                  <td style={{ fontSize: 13, fontWeight: 500 }}>₹{doc.consultationFee}</td>
                  <td style={{ fontSize: 13 }}>{doc.slotDuration} min</td>
                  <td><span className={`badge ${doc.isAvailable ? 'badge-success' : 'badge-danger'}`}>{doc.isAvailable ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty-state" style={{ padding: 40 }}><p>No doctors found</p></div>}
        </div>
      </div>

      {/* Add Doctor Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Add New Doctor</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group"><label className="form-label required">Full Name</label><input className="form-control" placeholder="Dr. First Last" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
                  <div className="form-group"><label className="form-label required">Mobile</label><input className="form-control" type="tel" maxLength={10} placeholder="10-digit mobile" value={form.mobile} onChange={e => set('mobile', e.target.value.replace(/\D/, ''))} required /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Email</label><input className="form-control" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
                  <div className="form-group"><label className="form-label required">Department</label>
                    <select className="form-control" value={form.departmentId} onChange={e => set('departmentId', e.target.value)} required>
                      <option value="">Select department</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group"><label className="form-label required">Specialization</label><input className="form-control" placeholder="e.g. Spine Surgery & Trauma" value={form.specialization} onChange={e => set('specialization', e.target.value)} required /></div>
                <div className="form-group"><label className="form-label required">Qualification</label><input className="form-control" placeholder="e.g. MBBS, MS Orthopaedics" value={form.qualification} onChange={e => set('qualification', e.target.value)} required /></div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Experience (years)</label><input className="form-control" type="number" min="0" value={form.experience} onChange={e => set('experience', e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Consultation Fee (₹)</label><input className="form-control" type="number" min="0" value={form.consultationFee} onChange={e => set('consultationFee', e.target.value)} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">Slot Duration (minutes)</label>
                    <select className="form-control" value={form.slotDuration} onChange={e => set('slotDuration', parseInt(e.target.value))}>
                      {[10, 15, 20, 30].map(v => <option key={v} value={v}>{v} minutes</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Login Password</label><input className="form-control" value={form.password} onChange={e => set('password', e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Bio</label><textarea className="form-control" rows={3} placeholder="Short bio for doctor's profile..." value={form.bio} onChange={e => set('bio', e.target.value)} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Adding...' : 'Add Doctor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
