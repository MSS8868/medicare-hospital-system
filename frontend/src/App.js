import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import './styles/global.css';

import LoginPage            from './pages/auth/LoginPage';
import CompleteProfilePage  from './pages/auth/CompleteProfilePage';
import DashboardLayout      from './components/common/DashboardLayout';

import PatientDashboard  from './pages/patient/PatientDashboard';
import BookAppointment   from './pages/patient/BookAppointment';
import MyAppointments    from './pages/patient/MyAppointments';
import FollowUps         from './pages/patient/FollowUps';
import PatientProfile    from './pages/patient/PatientProfile';

import DoctorDashboard   from './pages/doctor/DoctorDashboard';
import DoctorQueue       from './pages/doctor/DoctorQueue';
import ConsultationPage  from './pages/doctor/ConsultationPage';
import DoctorSchedule    from './pages/doctor/DoctorSchedule';
import DoctorPatients    from './pages/doctor/DoctorPatients';

import ReceptionistDashboard from './pages/receptionist/ReceptionistDashboard';
import WalkInBooking         from './pages/receptionist/WalkInBooking';

import AdminDashboard    from './pages/admin/AdminDashboard';
import ManageDoctors     from './pages/admin/ManageDoctors';
import ManageDepartments from './pages/admin/ManageDepartments';

const paths = { patient:'/patient', doctor:'/doctor', receptionist:'/receptionist', admin:'/admin' };

function Guard({ children, roles }) {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading-center" style={{minHeight:'100vh'}}><div className="spinner"/></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to={paths[user?.role] || '/login'} replace />;
  return children;
}

function Root() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={paths[user?.role] || '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{
          style:{ fontFamily:'DM Sans,sans-serif', fontSize:14, borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,.12)' },
          duration: 3500,
        }}/>
        <Routes>
          <Route path="/login"            element={<LoginPage/>}/>
          <Route path="/complete-profile" element={<Guard roles={['patient']}><CompleteProfilePage/></Guard>}/>
          <Route path="/"                 element={<Root/>}/>

          <Route path="/patient" element={<Guard roles={['patient']}><DashboardLayout/></Guard>}>
            <Route index       element={<PatientDashboard/>}/>
            <Route path="book" element={<BookAppointment/>}/>
            <Route path="appointments" element={<MyAppointments/>}/>
            <Route path="follow-ups"   element={<FollowUps/>}/>
            <Route path="profile"      element={<PatientProfile/>}/>
          </Route>

          <Route path="/doctor" element={<Guard roles={['doctor']}><DashboardLayout/></Guard>}>
            <Route index                           element={<DoctorDashboard/>}/>
            <Route path="queue"                    element={<DoctorQueue/>}/>
            <Route path="consultation/:appointmentId" element={<ConsultationPage/>}/>
            <Route path="schedule"                 element={<DoctorSchedule/>}/>
            <Route path="patients"                 element={<DoctorPatients/>}/>
          </Route>

          <Route path="/receptionist" element={<Guard roles={['receptionist']}><DashboardLayout/></Guard>}>
            <Route index           element={<ReceptionistDashboard/>}/>
            <Route path="walk-in"  element={<WalkInBooking/>}/>
          </Route>

          <Route path="/admin" element={<Guard roles={['admin']}><DashboardLayout/></Guard>}>
            <Route index                element={<AdminDashboard/>}/>
            <Route path="doctors"       element={<ManageDoctors/>}/>
            <Route path="departments"   element={<ManageDepartments/>}/>
          </Route>

          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
