/**
 * models/index.js
 *
 * All Sequelize models. Uses STRING not ENUM everywhere — MySQL-safe.
 * Valid values documented in comments and enforced in controllers.
 *
 * NEW MODELS (added in this version):
 *   - DoctorDateOverride: doctor extends/blocks hours on a specific date only
 *   - Notification: in-app messages to patients (schedule changes, reminders)
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt    = require('bcryptjs');

// ─────────────────────────────────────────────────────────────────────────────
// USER  —  role: 'patient' | 'doctor' | 'receptionist' | 'admin'
// ─────────────────────────────────────────────────────────────────────────────
const User = sequelize.define('User', {
  id:           { type: DataTypes.UUID,        defaultValue: DataTypes.UUIDV4, primaryKey: true },
  mobile:       { type: DataTypes.STRING(15),  allowNull: false, unique: true },
  email:        { type: DataTypes.STRING(255), allowNull: true,  unique: true },
  name:         { type: DataTypes.STRING(255), allowNull: false },
  role:         { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'patient' },
  password:     { type: DataTypes.STRING(255), allowNull: true  },
  otp:          { type: DataTypes.STRING(10),  allowNull: true  },
  otpExpiry:    { type: DataTypes.DATE,        allowNull: true  },
  isActive:     { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
  lastLogin:    { type: DataTypes.DATE,        allowNull: true  },
  profilePhoto: { type: DataTypes.STRING(500), allowNull: true  },
}, {
  tableName: 'Users',
  hooks: {
    // Hash password before every save if it changed
    beforeSave: async (user) => {
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    },
  },
});
User.prototype.validatePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT  —  gender: 'male' | 'female' | 'other'
// ─────────────────────────────────────────────────────────────────────────────
const Patient = sequelize.define('Patient', {
  id:                   { type: DataTypes.UUID,        defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId:               { type: DataTypes.UUID,        allowNull: false },
  dateOfBirth:          { type: DataTypes.DATEONLY,    allowNull: true  },
  age:                  { type: DataTypes.INTEGER,     allowNull: true  },
  gender:               { type: DataTypes.STRING(10),  allowNull: false, defaultValue: 'other' },
  bloodGroup:           { type: DataTypes.STRING(5),   allowNull: true  },
  address:              { type: DataTypes.TEXT,        allowNull: true  },
  emergencyContact:     { type: DataTypes.STRING(15),  allowNull: true  },
  emergencyContactName: { type: DataTypes.STRING(255), allowNull: true  },
  existingConditions:   { type: DataTypes.TEXT,        allowNull: true  },
  allergies:            { type: DataTypes.TEXT,        allowNull: true  },
  patientId:            { type: DataTypes.STRING(20),  allowNull: true, unique: true },
}, { tableName: 'Patients' });

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENT
// ─────────────────────────────────────────────────────────────────────────────
const Department = sequelize.define('Department', {
  id:          { type: DataTypes.UUID,        defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name:        { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT,        allowNull: true  },
  icon:        { type: DataTypes.STRING(10),  allowNull: true  },
  isActive:    { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
  color:       { type: DataTypes.STRING(10),  allowNull: false, defaultValue: '#4A90E2' },
}, { tableName: 'Departments' });

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR
// ─────────────────────────────────────────────────────────────────────────────
const Doctor = sequelize.define('Doctor', {
  id:                 { type: DataTypes.UUID,          defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId:             { type: DataTypes.UUID,          allowNull: false },
  departmentId:       { type: DataTypes.UUID,          allowNull: false },
  specialization:     { type: DataTypes.STRING(255),   allowNull: false },
  qualification:      { type: DataTypes.STRING(500),   allowNull: false },
  experience:         { type: DataTypes.INTEGER,       allowNull: false, defaultValue: 0 },
  bio:                { type: DataTypes.TEXT,          allowNull: true  },
  consultationFee:    { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 500 },
  slotDuration:       { type: DataTypes.INTEGER,       allowNull: false, defaultValue: 15 },
  isAvailable:        { type: DataTypes.BOOLEAN,       allowNull: false, defaultValue: true },
  registrationNumber: { type: DataTypes.STRING(100),   allowNull: true  },
  languages:          { type: DataTypes.STRING(255),   allowNull: false, defaultValue: 'English, Kannada' },
}, { tableName: 'Doctors' });

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR SCHEDULE  —  recurring weekly schedule
// dayOfWeek: 0=Sunday … 6=Saturday
// ─────────────────────────────────────────────────────────────────────────────
const DoctorSchedule = sequelize.define('DoctorSchedule', {
  id:          { type: DataTypes.UUID,      defaultValue: DataTypes.UUIDV4, primaryKey: true },
  doctorId:    { type: DataTypes.UUID,      allowNull: false },
  dayOfWeek:   { type: DataTypes.INTEGER,   allowNull: false },
  startTime:   { type: DataTypes.STRING(8), allowNull: false },
  endTime:     { type: DataTypes.STRING(8), allowNull: false },
  isActive:    { type: DataTypes.BOOLEAN,   allowNull: false, defaultValue: true },
  maxPatients: { type: DataTypes.INTEGER,   allowNull: false, defaultValue: 20 },
  breakStart:  { type: DataTypes.STRING(8), allowNull: true  },
  breakEnd:    { type: DataTypes.STRING(8), allowNull: true  },
}, { tableName: 'DoctorSchedules' });

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR DATE OVERRIDE  —  one-time override for a specific calendar date
//
// Use cases:
//   - Doctor extends hours today:  isWorking=true, startTime='08:00', endTime='20:00'
//   - Doctor blocks a specific day: isWorking=false
//   - Doctor works on a usually-off day (e.g., Sunday): isWorking=true with times
//
// Priority: if an override exists for a date → it wins over the weekly schedule.
// ─────────────────────────────────────────────────────────────────────────────
const DoctorDateOverride = sequelize.define('DoctorDateOverride', {
  id:        { type: DataTypes.UUID,         defaultValue: DataTypes.UUIDV4, primaryKey: true },
  doctorId:  { type: DataTypes.UUID,         allowNull: false },
  date:      { type: DataTypes.DATEONLY,     allowNull: false },  // e.g. '2024-04-15'
  isWorking: { type: DataTypes.BOOLEAN,      allowNull: false, defaultValue: true },
  startTime: { type: DataTypes.STRING(8),    allowNull: true  },  // null = use weekly schedule time
  endTime:   { type: DataTypes.STRING(8),    allowNull: true  },
  breakStart:{ type: DataTypes.STRING(8),    allowNull: true  },
  breakEnd:  { type: DataTypes.STRING(8),    allowNull: true  },
  reason:    { type: DataTypes.STRING(500),  allowNull: true  },  // e.g. "Extended OPD today"
}, {
  tableName: 'DoctorDateOverrides',
  indexes: [
    { unique: true, fields: ['doctorId', 'date'] }, // one override per doctor per date
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// SLOT  —  status: 'available' | 'booked' | 'locked' | 'blocked'
// ─────────────────────────────────────────────────────────────────────────────
const Slot = sequelize.define('Slot', {
  id:          { type: DataTypes.UUID,      defaultValue: DataTypes.UUIDV4, primaryKey: true },
  doctorId:    { type: DataTypes.UUID,      allowNull: false },
  date:        { type: DataTypes.DATEONLY,  allowNull: false },
  startTime:   { type: DataTypes.STRING(8), allowNull: false },
  endTime:     { type: DataTypes.STRING(8), allowNull: false },
  status:      { type: DataTypes.STRING(10),allowNull: false, defaultValue: 'available' },
  lockedAt:    { type: DataTypes.DATE,      allowNull: true  },
  lockedBy:    { type: DataTypes.UUID,      allowNull: true  },
  tokenNumber: { type: DataTypes.INTEGER,   allowNull: true  },
}, {
  tableName: 'Slots',
  indexes: [
    { fields: ['doctorId', 'date', 'status'] }, // fast slot availability lookups
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENT
// status:   'confirmed' | 'visited' | 'not_visited' | 'cancelled' | 'referred' | 'admitted'
// type:     'new' | 'follow_up'
// bookedBy: 'patient' | 'receptionist'
// ─────────────────────────────────────────────────────────────────────────────
const Appointment = sequelize.define('Appointment', {
  id:              { type: DataTypes.UUID,       defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId:   { type: DataTypes.STRING(30), allowNull: false, unique: true },
  patientId:       { type: DataTypes.UUID,       allowNull: false },
  doctorId:        { type: DataTypes.UUID,       allowNull: false },
  slotId:          { type: DataTypes.UUID,       allowNull: false },
  departmentId:    { type: DataTypes.UUID,       allowNull: false },
  appointmentDate: { type: DataTypes.DATEONLY,   allowNull: false },
  appointmentTime: { type: DataTypes.STRING(8),  allowNull: false },
  tokenNumber:     { type: DataTypes.INTEGER,    allowNull: true  },
  status:          { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'confirmed' },
  type:            { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'new' },
  cancelReason:    { type: DataTypes.TEXT,       allowNull: true  },
  notes:           { type: DataTypes.TEXT,       allowNull: true  },
  bookedBy:        { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'patient' },
  isEmergency:     { type: DataTypes.BOOLEAN,    allowNull: false, defaultValue: false },
  // Tracks if a schedule-change notification was sent for this appointment
  scheduleChangeNotified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  tableName: 'Appointments',
  indexes: [
    { fields: ['patientId', 'appointmentDate'] },
    { fields: ['doctorId',  'appointmentDate', 'status'] },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTATION
// medicines, testsAdvised, vitals = JSON strings. Always parse before use.
// ─────────────────────────────────────────────────────────────────────────────
const Consultation = sequelize.define('Consultation', {
  id:             { type: DataTypes.UUID,        defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointmentId:  { type: DataTypes.UUID,        allowNull: false, unique: true },
  patientId:      { type: DataTypes.UUID,        allowNull: false },
  doctorId:       { type: DataTypes.UUID,        allowNull: false },
  visitDate:      { type: DataTypes.DATEONLY,    allowNull: false },
  chiefComplaint: { type: DataTypes.TEXT,        allowNull: true  },
  symptoms:       { type: DataTypes.TEXT,        allowNull: true  },
  duration:       { type: DataTypes.STRING(100), allowNull: true  },
  diagnosis:      { type: DataTypes.TEXT,        allowNull: true  },
  clinicalNotes:  { type: DataTypes.TEXT,        allowNull: true  },
  medicines:      { type: DataTypes.TEXT,        allowNull: true  }, // JSON: [{name,dosage,frequency,duration,instructions}]
  testsAdvised:   { type: DataTypes.TEXT,        allowNull: true  }, // JSON: [{name}]
  vitals:         { type: DataTypes.TEXT,        allowNull: true  }, // JSON: {bp,pulse,temp,weight,height,spo2}
  followUpDate:   { type: DataTypes.DATEONLY,    allowNull: true  },
  followUpNotes:  { type: DataTypes.TEXT,        allowNull: true  },
  aiGenerated:    { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
  rawAiInput:     { type: DataTypes.TEXT,        allowNull: true  },
}, { tableName: 'Consultations' });

// ─────────────────────────────────────────────────────────────────────────────
// FOLLOW-UP
// status: 'pending' | 'accepted' | 'rejected' | 'rescheduled' | 'booked'
// ─────────────────────────────────────────────────────────────────────────────
const FollowUp = sequelize.define('FollowUp', {
  id:               { type: DataTypes.UUID,       defaultValue: DataTypes.UUIDV4, primaryKey: true },
  consultationId:   { type: DataTypes.UUID,       allowNull: false },
  appointmentId:    { type: DataTypes.UUID,       allowNull: false },
  patientId:        { type: DataTypes.UUID,       allowNull: false },
  doctorId:         { type: DataTypes.UUID,       allowNull: false },
  followUpDate:     { type: DataTypes.DATEONLY,   allowNull: false },
  followUpNotes:    { type: DataTypes.TEXT,       allowNull: true  },
  status:           { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
  patientResponse:  { type: DataTypes.TEXT,       allowNull: true  },
  rescheduleDate:   { type: DataTypes.DATEONLY,   allowNull: true  },
  newAppointmentId: { type: DataTypes.UUID,       allowNull: true  },
  notifiedAt:       { type: DataTypes.DATE,       allowNull: true  },
}, { tableName: 'FollowUps' });

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION  —  in-app alerts to patients
// type: 'schedule_change' | 'appointment_reminder' | 'follow_up_request'
// ─────────────────────────────────────────────────────────────────────────────
const Notification = sequelize.define('Notification', {
  id:            { type: DataTypes.UUID,        defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId:        { type: DataTypes.UUID,        allowNull: false },  // patient's user id
  patientId:     { type: DataTypes.UUID,        allowNull: true  },
  appointmentId: { type: DataTypes.UUID,        allowNull: true  },
  type:          { type: DataTypes.STRING(30),  allowNull: false },
  title:         { type: DataTypes.STRING(255), allowNull: false },
  message:       { type: DataTypes.TEXT,        allowNull: false },
  isRead:        { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
  readAt:        { type: DataTypes.DATE,        allowNull: true  },
  metadata:      { type: DataTypes.TEXT,        allowNull: true  }, // JSON for extra data
}, {
  tableName: 'Notifications',
  indexes: [
    { fields: ['userId', 'isRead'] },   // fast unread count lookups
    { fields: ['appointmentId'] },
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────
const AuditLog = sequelize.define('AuditLog', {
  id:        { type: DataTypes.UUID,        defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId:    { type: DataTypes.UUID,        allowNull: true  },
  action:    { type: DataTypes.STRING(100), allowNull: false },
  entity:    { type: DataTypes.STRING(50),  allowNull: true  },
  entityId:  { type: DataTypes.UUID,        allowNull: true  },
  oldValues: { type: DataTypes.TEXT,        allowNull: true  },
  newValues: { type: DataTypes.TEXT,        allowNull: true  },
  ipAddress: { type: DataTypes.STRING(45),  allowNull: true  },
  userAgent: { type: DataTypes.TEXT,        allowNull: true  },
}, { tableName: 'AuditLogs' });

// ─────────────────────────────────────────────────────────────────────────────
// ASSOCIATIONS
// ─────────────────────────────────────────────────────────────────────────────

User.hasOne(Patient, { foreignKey: 'userId', as: 'patientProfile' });
Patient.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(Doctor, { foreignKey: 'userId', as: 'doctorProfile' });
Doctor.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Department.hasMany(Doctor, { foreignKey: 'departmentId', as: 'doctors' });
Doctor.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Doctor.hasMany(DoctorSchedule, { foreignKey: 'doctorId', as: 'schedules' });
DoctorSchedule.belongsTo(Doctor, { foreignKey: 'doctorId', as: 'doctor' });

Doctor.hasMany(DoctorDateOverride, { foreignKey: 'doctorId', as: 'dateOverrides' });
DoctorDateOverride.belongsTo(Doctor, { foreignKey: 'doctorId', as: 'doctor' });

Doctor.hasMany(Slot, { foreignKey: 'doctorId', as: 'slots' });
Slot.belongsTo(Doctor, { foreignKey: 'doctorId', as: 'doctor' });

Patient.hasMany(Appointment, { foreignKey: 'patientId', as: 'appointments' });
Appointment.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });

Doctor.hasMany(Appointment, { foreignKey: 'doctorId', as: 'appointments' });
Appointment.belongsTo(Doctor, { foreignKey: 'doctorId', as: 'doctor' });

Slot.hasOne(Appointment, { foreignKey: 'slotId', as: 'appointment' });
Appointment.belongsTo(Slot, { foreignKey: 'slotId', as: 'slot' });

Appointment.hasOne(Consultation, { foreignKey: 'appointmentId', as: 'consultation' });
Consultation.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });

Patient.hasMany(FollowUp, { foreignKey: 'patientId', as: 'followUps' });
FollowUp.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });

Doctor.hasMany(FollowUp, { foreignKey: 'doctorId', as: 'followUps' });
FollowUp.belongsTo(Doctor, { foreignKey: 'doctorId', as: 'doctor' });

Consultation.hasOne(FollowUp, { foreignKey: 'consultationId', as: 'followUp' });
FollowUp.belongsTo(Consultation, { foreignKey: 'consultationId', as: 'consultation' });

Appointment.hasMany(FollowUp, { foreignKey: 'appointmentId', as: 'followUps' });
FollowUp.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'sourceAppointment' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Appointment.hasMany(Notification, { foreignKey: 'appointmentId', as: 'notifications' });
Notification.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });

module.exports = {
  sequelize,
  User,
  Patient,
  Department,
  Doctor,
  DoctorSchedule,
  DoctorDateOverride,
  Slot,
  Appointment,
  Consultation,
  FollowUp,
  Notification,
  AuditLog,
};
