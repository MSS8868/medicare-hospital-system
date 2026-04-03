/**
 * controllers/doctorController.js
 *
 * Handles all doctor, department, schedule and date-override operations.
 *
 * NEW in this version:
 *   - createDateOverride / updateDateOverride / deleteDateOverride / getDateOverrides
 *     → Doctor can extend or block hours on a specific date without changing weekly schedule
 *   - Schedule change now writes Notification records to DB (visible in patient portal)
 *   - Affected appointments marked scheduleChangeNotified=true to avoid duplicate notifications
 */

const { Op } = require('sequelize');
const {
  Doctor, User, Department, DoctorSchedule, DoctorDateOverride,
  Appointment, Patient, Notification,
} = require('../models');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const {
  clearFutureSlots,
  regenerateSlotsForDate,
} = require('../utils/slotEngine');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const doctorIncludes = () => [
  { model: User,           as: 'user',      attributes: ['id', 'name', 'mobile', 'email', 'profilePhoto'] },
  { model: Department,     as: 'department' },
  { model: DoctorSchedule, as: 'schedules'  },
];

/** Convert HH:MM to minutes since midnight */
function toMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Find all future confirmed appointments that fall outside the new schedule.
 * Used to notify patients when doctor changes their weekly recurring schedule.
 */
async function findAffectedAppointments(doctorId, newSchedules) {
  const today = new Date().toISOString().split('T')[0];
  const appointments = await Appointment.findAll({
    where: {
      doctorId,
      appointmentDate: { [Op.gt]: today },  // only FUTURE appointments
      status:          'confirmed',
      scheduleChangeNotified: false,         // avoid duplicate notifications
    },
    include: [
      { model: Patient, as: 'patient', include: [{ model: User, as: 'user' }] },
    ],
  });

  return appointments.filter(apt => {
    // Parse appointment date as local to get correct day-of-week
    const [y, mo, d] = apt.appointmentDate.split('-').map(Number);
    const aptDay = new Date(y, mo - 1, d).getDay();
    const aptMins = toMins(apt.appointmentTime);

    const newSched = newSchedules.find(s => s.dayOfWeek === aptDay && s.isActive);

    if (!newSched) return true; // Day no longer active → affected

    const startMins = toMins(newSched.startTime);
    const endMins   = toMins(newSched.endTime);

    // Check if appointment time falls outside new working hours
    if (aptMins < startMins || aptMins >= endMins) return true;

    // Check if appointment time falls inside the new break window
    if (newSched.breakStart && newSched.breakEnd) {
      const bStart = toMins(newSched.breakStart);
      const bEnd   = toMins(newSched.breakEnd);
      if (aptMins >= bStart && aptMins < bEnd) return true;
    }

    return false; // Not affected
  });
}

/**
 * Create in-app Notification records for affected patients.
 * Also marks appointments as notified so we don't send twice.
 */
async function notifyAffectedPatients(affectedAppointments, doctorName) {
  for (const apt of affectedAppointments) {
    try {
      // Only notify if patient has a user account
      const patientUser = apt.patient?.user;
      if (!patientUser) continue;

      await Notification.create({
        id:            uuidv4(),
        userId:        patientUser.id,
        patientId:     apt.patientId,
        appointmentId: apt.id,
        type:          'schedule_change',
        title:         'Doctor Schedule Changed — Action Required',
        message:       `Your appointment with ${doctorName} on ${apt.appointmentDate} at ${apt.appointmentTime} may no longer be valid due to a schedule change. Please log in and reschedule your appointment at a new available time.`,
        isRead:        false,
        metadata:      JSON.stringify({
          doctorName,
          appointmentDate: apt.appointmentDate,
          appointmentTime: apt.appointmentTime,
          appointmentId:   apt.appointmentId,
        }),
      });

      // Mark as notified so we don't send again
      await apt.update({ scheduleChangeNotified: true });

      logger.info(`[NOTIFY] Patient ${patientUser.mobile} notified about schedule change for appt ${apt.appointmentId}`);
    } catch (err) {
      // Don't fail the whole request if one notification fails
      logger.error(`[NOTIFY] Failed to notify patient for appt ${apt.id}:`, err.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCTORS — READ
// ─────────────────────────────────────────────────────────────────────────────

exports.getDoctors = async (req, res) => {
  try {
    const { departmentId, isAvailable } = req.query;
    const where = {};
    if (departmentId)              where.departmentId = departmentId;
    if (isAvailable !== undefined) where.isAvailable  = isAvailable === 'true';

    const doctors = await Doctor.findAll({ where, include: doctorIncludes() });
    res.json({ success: true, doctors });
  } catch (err) {
    logger.error('getDoctors:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch doctors: ' + err.message });
  }
};

exports.getDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id, { include: doctorIncludes() });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch doctor: ' + err.message });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.user.id }, include: doctorIncludes() });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor profile not found. Contact admin.' });
    res.json({ success: true, doctor });
  } catch (err) {
    logger.error('getMyProfile:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE — READ
// ─────────────────────────────────────────────────────────────────────────────

exports.getMySchedule = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const schedules = await DoctorSchedule.findAll({
      where: { doctorId: doctor.id },
      order: [['dayOfWeek', 'ASC']],
    });
    res.json({ success: true, schedules, doctorId: doctor.id, slotDuration: doctor.slotDuration });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch schedule: ' + err.message });
  }
};

exports.getSchedule = async (req, res) => {
  try {
    const schedules = await DoctorSchedule.findAll({
      where: { doctorId: req.params.id },
      order: [['dayOfWeek', 'ASC']],
    });
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch schedule: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE — UPDATE (weekly recurring)
// ─────────────────────────────────────────────────────────────────────────────

exports.updateMySchedule = async (req, res) => {
  try {
    const { schedules } = req.body;
    if (!Array.isArray(schedules) || schedules.length === 0)
      return res.status(400).json({ success: false, message: 'schedules array required' });

    const doctor = await Doctor.findOne({
      where:   { userId: req.user.id },
      include: [{ model: User, as: 'user', attributes: ['name'] }],
    });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    // Find affected appointments BEFORE changing the schedule
    const affected = await findAffectedAppointments(doctor.id, schedules);

    // Replace the weekly schedule
    await DoctorSchedule.destroy({ where: { doctorId: doctor.id } });
    const created = await DoctorSchedule.bulkCreate(
      schedules.map(s => ({ ...s, id: uuidv4(), doctorId: doctor.id }))
    );

    // Clear future generated slots so they regenerate with new times
    const clearedSlots = await clearFutureSlots(doctor.id);

    // Notify affected patients via in-app notifications
    await notifyAffectedPatients(affected, doctor.user?.name || 'Doctor');

    res.json({
      success: true,
      message: `Schedule updated. ${affected.length} patient(s) notified. ${clearedSlots} future slot(s) cleared.`,
      schedules:     created,
      affectedCount: affected.length,
      slotsCleared:  clearedSlots,
    });
  } catch (err) {
    logger.error('updateMySchedule:', err);
    res.status(500).json({ success: false, message: 'Failed to update schedule: ' + err.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const { schedules } = req.body;
    const { id: doctorId } = req.params;

    const doctor = await Doctor.findByPk(doctorId, { include: [{ model: User, as: 'user', attributes: ['name'] }] });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const affected = await findAffectedAppointments(doctorId, schedules);

    await DoctorSchedule.destroy({ where: { doctorId } });
    const created = await DoctorSchedule.bulkCreate(schedules.map(s => ({ ...s, id: uuidv4(), doctorId })));

    const clearedSlots = await clearFutureSlots(doctorId);
    await notifyAffectedPatients(affected, doctor.user?.name || 'Doctor');

    res.json({
      success: true,
      message: `Schedule updated. ${affected.length} patient(s) notified. ${clearedSlots} slot(s) cleared.`,
      schedules:     created,
      affectedCount: affected.length,
      slotsCleared:  clearedSlots,
    });
  } catch (err) {
    logger.error('updateSchedule (admin):', err);
    res.status(500).json({ success: false, message: 'Failed to update schedule: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DATE OVERRIDE — CRUD
// Allows doctor to override hours on a specific calendar date
// without changing their recurring weekly schedule.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/doctors/me/overrides?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns the logged-in doctor's date overrides (upcoming by default).
 */
exports.getMyOverrides = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const today   = new Date().toISOString().split('T')[0];
    const { from = today, to } = req.query;
    const dateWhere = { [Op.gte]: from };
    if (to) dateWhere[Op.lte] = to;

    const overrides = await DoctorDateOverride.findAll({
      where: { doctorId: doctor.id, date: dateWhere },
      order: [['date', 'ASC']],
    });
    res.json({ success: true, overrides, doctorId: doctor.id });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch overrides: ' + err.message });
  }
};

/**
 * POST /api/doctors/me/overrides
 * Create or update a date override for the logged-in doctor.
 * Body: { date, isWorking, startTime, endTime, breakStart, breakEnd, reason }
 *
 * When creating/updating an override:
 *   - Regenerate slots for that date with the new times
 *   - Notify any booked patients whose appointment is affected
 */
exports.upsertMyOverride = async (req, res) => {
  try {
    const { date, isWorking = true, startTime, endTime, breakStart, breakEnd, reason } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'date is required (YYYY-MM-DD)' });

    const doctor = await Doctor.findOne({
      where:   { userId: req.user.id },
      include: [{ model: User, as: 'user', attributes: ['name'] }],
    });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    // Validate times if working
    if (isWorking && (!startTime || !endTime)) {
      return res.status(400).json({ success: false, message: 'startTime and endTime required when isWorking=true' });
    }
    if (isWorking && toMins(startTime) >= toMins(endTime)) {
      return res.status(400).json({ success: false, message: 'startTime must be before endTime' });
    }

    // Upsert — create if not exists, update if exists
    const [override, created] = await DoctorDateOverride.findOrCreate({
      where:    { doctorId: doctor.id, date },
      defaults: { id: uuidv4(), doctorId: doctor.id, date, isWorking, startTime, endTime, breakStart, breakEnd, reason },
    });
    if (!created) {
      await override.update({ isWorking, startTime, endTime, breakStart, breakEnd, reason });
    }

    // Regenerate slots for this specific date with new override times
    const newSlots = await regenerateSlotsForDate(doctor.id, date, doctor.slotDuration || 15);

    // If blocking a date, notify patients with appointments on that date
    if (!isWorking) {
      const bookedOnDate = await Appointment.findAll({
        where:   { doctorId: doctor.id, appointmentDate: date, status: 'confirmed', scheduleChangeNotified: false },
        include: [{ model: Patient, as: 'patient', include: [{ model: User, as: 'user' }] }],
      });
      await notifyAffectedPatients(bookedOnDate, doctor.user?.name || 'Doctor');
    }

    res.json({
      success:       true,
      message:       created ? 'Date override created' : 'Date override updated',
      override,
      slotsGenerated: newSlots.length,
    });
  } catch (err) {
    logger.error('upsertMyOverride:', err);
    res.status(500).json({ success: false, message: 'Failed to save override: ' + err.message });
  }
};

/**
 * DELETE /api/doctors/me/overrides/:date
 * Remove a date override → slots revert to weekly schedule.
 */
exports.deleteMyOverride = async (req, res) => {
  try {
    const { date } = req.params;
    const doctor = await Doctor.findOne({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

    const deleted = await DoctorDateOverride.destroy({ where: { doctorId: doctor.id, date } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Override not found for this date' });

    // Regenerate slots based on weekly schedule now that override is gone
    await regenerateSlotsForDate(doctor.id, date, doctor.slotDuration || 15);

    res.json({ success: true, message: 'Override removed. Slots reverted to weekly schedule.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete override: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────────────────────────────────────

exports.getDepartments = async (req, res) => {
  try {
    const departments = await Department.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
    res.json({ success: true, departments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch departments: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — CREATE DOCTOR
// ─────────────────────────────────────────────────────────────────────────────

exports.createDoctor = async (req, res) => {
  try {
    const {
      name, mobile, email,
      password     = 'Doctor@123',
      departmentId, specialization, qualification, experience, bio,
      consultationFee, slotDuration,
    } = req.body;
    if (!name || !mobile || !departmentId)
      return res.status(400).json({ success: false, message: 'Name, mobile and department are required' });

    const existing = await User.findOne({ where: { mobile } });
    if (existing) return res.status(409).json({ success: false, message: 'Mobile number already registered' });

    const user = await User.create({
      id: uuidv4(), name, mobile, email, role: 'doctor', password, isActive: true,
    });
    const doctor = await Doctor.create({
      id:             uuidv4(),
      userId:         user.id,
      departmentId,
      specialization: specialization || 'General',
      qualification:  qualification  || 'MBBS',
      experience:     experience     || 0,
      bio,
      consultationFee: consultationFee || 500,
      slotDuration:    slotDuration    || 15,
      isAvailable:     true,
    });

    // Default Mon–Sat schedule 9am–5pm
    for (const day of [1, 2, 3, 4, 5, 6]) {
      await DoctorSchedule.create({
        id: uuidv4(), doctorId: doctor.id, dayOfWeek: day,
        startTime: '09:00', endTime: '17:00',
        breakStart: '13:00', breakEnd: '14:00',
        isActive: true, maxPatients: 20,
      });
    }

    const full = await Doctor.findByPk(doctor.id, { include: doctorIncludes() });
    res.status(201).json({ success: true, message: 'Doctor created successfully', doctor: full });
  } catch (err) {
    logger.error('createDoctor:', err);
    res.status(500).json({ success: false, message: 'Failed to create doctor: ' + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

exports.getAnalytics = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [total, todayCount, cancelled, totalPatients, totalDoctors] = await Promise.all([
      Appointment.count(),
      Appointment.count({ where: { appointmentDate: today } }),
      Appointment.count({ where: { status: 'cancelled' } }),
      Patient.count(),
      Doctor.count(),
    ]);
    res.json({
      success: true,
      analytics: {
        totalAppointments:    total,
        todayAppointments:    todayCount,
        cancelledAppointments: cancelled,
        cancellationRate:     total ? ((cancelled / total) * 100).toFixed(1) : 0,
        totalPatients,
        totalDoctors,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch analytics: ' + err.message });
  }
};
