import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { deptAPI } from '../../services/api';
import { MdAdd } from 'react-icons/md';

export default function ManageDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    deptAPI.getAll().then(r => setDepartments(r.data.departments || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div className="fade-in">
      <div className="page-header-row">
        <div className="page-header"><h1>Departments</h1><p>{departments.length} departments configured</p></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {departments.map(dept => (
          <div key={dept.id} className="card" style={{ padding: 20, borderTop: `4px solid ${dept.color}` }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{dept.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{dept.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{dept.description}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="badge" style={{ background: dept.color + '20', color: dept.color }}>{dept.isActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
