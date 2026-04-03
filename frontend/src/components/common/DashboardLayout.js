import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { patientAPI } from '../../services/api';
import {
  MdLocalHospital, MdDashboard, MdCalendarToday, MdPeople, MdPerson,
  MdSchedule, MdMedicalServices, MdSettings, MdMenu, MdClose,
  MdQueueMusic, MdLogout, MdAddCircle, MdNotifications,
} from 'react-icons/md';
import { FiChevronRight } from 'react-icons/fi';

const ROLE_COLORS = {
  patient:      { badge: '#00BFA5', label: 'Patient' },
  doctor:       { badge: '#7B1FA2', label: 'Doctor' },
  receptionist: { badge: '#FB8C00', label: 'Receptionist' },
  admin:        { badge: '#E53935', label: 'Admin' },
};

const NAV_CONFIG = {
  patient: [
    { to: '/patient',              label: 'Dashboard',        icon: MdDashboard,    exact: true },
    { to: '/patient/book',         label: 'Book Appointment', icon: MdAddCircle },
    { to: '/patient/appointments', label: 'My Appointments',  icon: MdCalendarToday },
    { to: '/patient/follow-ups',   label: 'Follow-ups',       icon: MdNotifications },
    { to: '/patient/profile',      label: 'My Profile',       icon: MdPerson },
  ],
  doctor: [
    { to: '/doctor',          label: 'Dashboard',     icon: MdDashboard,       exact: true },
    { to: '/doctor/queue',    label: "Today's Queue",  icon: MdQueueMusic },
    { to: '/doctor/patients', label: 'Patients',      icon: MdPeople },
    { to: '/doctor/schedule', label: 'My Schedule',   icon: MdSchedule },
  ],
  receptionist: [
    { to: '/receptionist',         label: 'Dashboard',       icon: MdDashboard, exact: true },
    { to: '/receptionist/walk-in', label: 'Walk-in Booking', icon: MdAddCircle },
  ],
  admin: [
    { to: '/admin',             label: 'Dashboard',      icon: MdDashboard,      exact: true },
    { to: '/admin/doctors',     label: 'Manage Doctors', icon: MdMedicalServices },
    { to: '/admin/departments', label: 'Departments',    icon: MdSettings },
  ],
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [open, setOpen]                 = useState(false);
  const [pendingFollowUps, setPending]  = useState(0);
  const overlayRef = useRef(null);

  // Close sidebar when route changes (mobile)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Prevent body scroll when sidebar open on mobile
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Fetch pending follow-ups for patient badge
  useEffect(() => {
    if (user?.role === 'patient') {
      patientAPI.getFollowUps()
        .then(r => setPending((r.data.followUps||[]).filter(f => f.status === 'pending').length))
        .catch(() => {});
    }
  }, [user?.role, location.pathname]);

  const navItems = NAV_CONFIG[user?.role] || [];
  const roleInfo = ROLE_COLORS[user?.role] || {};
  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const handleLogout = () => { logout(); navigate('/login'); };

  const currentNav = navItems.find(n =>
    n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to)
  );

  const SidebarNav = () => (
    <>
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(255,255,255,.15)', borderRadius: 10, padding: '6px 7px', display: 'flex' }}>
            <MdLocalHospital size={20} color="white" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', color: 'white', fontSize: 17, fontWeight: 700, lineHeight: 1 }}>MediCare</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 10, marginTop: 1 }}>Hospital Management</div>
          </div>
          {/* Close button — mobile only */}
          <button onClick={() => setOpen(false)} className="btn btn-ghost btn-icon"
            style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.7)', display: 'flex' }}>
            <MdClose size={20} />
          </button>
        </div>
      </div>

      {/* User card */}
      <div style={{ margin: '10px 10px', background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="avatar" style={{ width: 36, height: 36, fontSize: 13, background: 'rgba(255,255,255,.2)', color: 'white', flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'white', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
          <span style={{ background: roleInfo.badge, color: 'white', fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 600, display: 'inline-block', marginTop: 2 }}>{roleInfo.label}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section">Navigation</div>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
          const badge = item.badge || (item.to === '/patient/follow-ups' ? pendingFollowUps : 0);
          return (
            <NavLink key={item.to} to={item.to}
              className={() => `sidebar-item${isActive ? ' active' : ''}`}>
              <Icon size={17} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {badge > 0 && (
                <span style={{ background: 'var(--warning)', color: 'white', minWidth: 18, height: 18, borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {badge}
                </span>
              )}
              {isActive && badge === 0 && <FiChevronRight size={13} style={{ opacity: .6 }} />}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={handleLogout} style={{ color: 'rgba(255,110,110,.9)' }}>
          <MdLogout size={17} /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="app-layout">
      {/* Sidebar — mobile: hidden/shown; desktop: always visible */}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <SidebarNav />
      </aside>

      {/* Mobile overlay backdrop */}
      {open && (
        <div ref={overlayRef} className="sidebar-overlay visible" onClick={() => setOpen(false)} />
      )}

      <div className="main-content">
        {/* Topbar */}
        <header className="topbar">
          {/* Hamburger — visible on all sizes since sidebar is off-canvas */}
          <button className="btn btn-ghost btn-icon" onClick={() => setOpen(true)} style={{ flexShrink: 0 }}>
            <MdMenu size={22} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentNav?.label || 'Dashboard'}
            </h3>
          </div>

          {/* Notification bell — patients only */}
          {user?.role === 'patient' && pendingFollowUps > 0 && (
            <button className="btn btn-ghost btn-icon" onClick={() => navigate('/patient/follow-ups')}
              style={{ position: 'relative', flexShrink: 0 }}>
              <MdNotifications size={22} color="var(--warning)" />
              <span style={{ position: 'absolute', top: 2, right: 2, background: 'var(--warning)', color: 'white', width: 16, height: 16, borderRadius: 8, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pendingFollowUps}
              </span>
            </button>
          )}

          <div className="avatar" style={{ width: 34, height: 34, fontSize: 12, cursor: 'pointer', background: 'var(--primary-50)', color: 'var(--primary)', flexShrink: 0 }}>
            {initials}
          </div>
        </header>

        {/* Page */}
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
