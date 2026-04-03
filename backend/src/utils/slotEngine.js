/**
 * utils/slotEngine.js
 *
 * Generates and manages appointment slots for doctors.
 *
 * KEY LOGIC:
 *   1. Check DoctorDateOverride for the requested date first
 *   2. If override exists and isWorking=false → no slots
 *   3. If override exists and isWorking=true → use override times (not weekly schedule)
 *   4. If no override → use weekly DoctorSchedule for that day of week
 *   5. Timezone fix: parse date as local time (not UTC) to avoid day-shift in IST
 */

const { Op } = require('sequelize');
const { Slot, DoctorSchedule, DoctorDateOverride } = require('../models');
const { v4: uuidv4 } = require('uuid');

/**
 * Parse a YYYY-MM-DD string as LOCAL date (avoids UTC midnight IST day-shift bug).
 * new Date('2024-04-01') → UTC midnight → IST = March 31 11:30pm → wrong day!
 * new Date(2024, 3, 1)   → local midnight → correct day always
 */
function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

/**
 * Convert HH:MM string to total minutes from midnight
 */
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert total minutes to HH:MM string
 */
function toTimeStr(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Generate slots from a time range, skipping break time.
 * Returns array of slot objects (not yet saved to DB).
 */
function buildSlots(doctorId, date, startTime, endTime, breakStart, breakEnd, slotDuration) {
  const start = toMinutes(startTime);
  const end   = toMinutes(endTime);
  const bStart = breakStart ? toMinutes(breakStart) : null;
  const bEnd   = breakEnd   ? toMinutes(breakEnd)   : null;

  const slots = [];
  let current = start;
  let token   = 1;

  while (current + slotDuration <= end) {
    // Skip break window
    if (bStart !== null && bEnd !== null && current >= bStart && current < bEnd) {
      current += slotDuration;
      continue;
    }

    slots.push({
      id:          uuidv4(),
      doctorId,
      date,
      startTime:   toTimeStr(current),
      endTime:     toTimeStr(current + slotDuration),
      status:      'available',
      tokenNumber: token,
    });

    token++;
    current += slotDuration;
  }

  return slots;
}

/**
 * Generate slots for a doctor on a specific date.
 * Checks override first, falls back to weekly schedule.
 * Only generates if no non-booked slots already exist (idempotent).
 */
async function generateSlotsForDate(doctorId, date, slotDurationMinutes = 15) {
  // Use local date parsing to avoid timezone day-shift
  const dateObj  = parseLocalDate(date);
  const dayOfWeek = dateObj.getDay(); // 0=Sun ... 6=Sat

  // ── Step 1: Check for a date-specific override ────────────────────────────
  const override = await DoctorDateOverride.findOne({
    where: { doctorId, date },
  });

  let effectiveStart, effectiveEnd, effectiveBreakStart, effectiveBreakEnd;

  if (override) {
    if (!override.isWorking) {
      // Doctor explicitly blocked this date — no slots
      return [];
    }
    // Doctor has override hours for this date
    effectiveStart      = override.startTime;
    effectiveEnd        = override.endTime;
    effectiveBreakStart = override.breakStart;
    effectiveBreakEnd   = override.breakEnd;
  } else {
    // ── Step 2: Fall back to weekly recurring schedule ──────────────────────
    const schedule = await DoctorSchedule.findOne({
      where: { doctorId, dayOfWeek, isActive: true },
    });
    if (!schedule) return []; // Doctor doesn't work on this day of week
    effectiveStart      = schedule.startTime;
    effectiveEnd        = schedule.endTime;
    effectiveBreakStart = schedule.breakStart;
    effectiveBreakEnd   = schedule.breakEnd;
  }

  // ── Step 3: Check if slots already exist (avoid duplicate generation) ─────
  // We skip generation if any non-booked slots exist already
  const existingCount = await Slot.count({
    where: { doctorId, date, status: { [Op.ne]: 'booked' } },
  });
  if (existingCount > 0) {
    // Slots already generated, return existing
    return Slot.findAll({
      where: { doctorId, date },
      order: [['startTime', 'ASC']],
    });
  }

  // ── Step 4: Build and save new slots ──────────────────────────────────────
  const slotsToCreate = buildSlots(
    doctorId, date,
    effectiveStart, effectiveEnd,
    effectiveBreakStart, effectiveBreakEnd,
    slotDurationMinutes
  );

  if (slotsToCreate.length === 0) return [];

  await Slot.bulkCreate(slotsToCreate);
  return Slot.findAll({ where: { doctorId, date }, order: [['startTime', 'ASC']] });
}

/**
 * Regenerate slots for a specific date after an override is created/updated.
 * Deletes existing available/locked slots and regenerates with new times.
 * Never deletes BOOKED slots (those patients keep their appointments).
 */
async function regenerateSlotsForDate(doctorId, date, slotDurationMinutes = 15) {
  // Delete only non-booked slots — keep booked ones
  await Slot.destroy({
    where: { doctorId, date, status: { [Op.ne]: 'booked' } },
  });
  return generateSlotsForDate(doctorId, date, slotDurationMinutes);
}

/**
 * Lock a slot for 3 minutes while patient completes booking.
 * Returns the updated slot, or null if already taken.
 */
async function lockSlot(slotId, userId) {
  const slot = await Slot.findByPk(slotId);
  if (!slot || slot.status !== 'available') return null;

  await slot.update({
    status:   'locked',
    lockedAt: new Date(),
    lockedBy: userId,
  });
  return slot;
}

/**
 * Release all expired slot locks (cron job runs this every minute).
 * Lock expires after 3 minutes — frees up abandoned booking attempts.
 */
async function releaseExpiredLocks() {
  const lockExpiry = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
  const released = await Slot.update(
    { status: 'available', lockedAt: null, lockedBy: null },
    {
      where: {
        status:   'locked',
        lockedAt: { [Op.lt]: lockExpiry },
      },
    }
  );
  return released[0]; // number of rows updated
}

/**
 * Get available slots for a doctor on a date (for patient booking flow).
 * Generates slots if none exist yet.
 */
async function getAvailableSlots(doctorId, date, doctor) {
  const duration = doctor?.slotDuration || 15;
  await generateSlotsForDate(doctorId, date, duration);
  await releaseExpiredLocks();

  return Slot.findAll({
    where:  { doctorId, date, status: 'available' },
    order:  [['startTime', 'ASC']],
  });
}

/**
 * Get ALL slots for a date (available + booked + locked) for visual display.
 * Used by BookAppointment to show grey/red blocked slots.
 */
async function getAllSlots(doctorId, date, doctor) {
  const duration = doctor?.slotDuration || 15;
  await generateSlotsForDate(doctorId, date, duration);
  await releaseExpiredLocks();

  return Slot.findAll({
    where: { doctorId, date },
    order: [['startTime', 'ASC']],
  });
}

/**
 * Clear future slots for a doctor (called after schedule change).
 * Tomorrow and beyond only — never touches today's slots.
 * Never deletes BOOKED slots.
 */
async function clearFutureSlots(doctorId) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const count = await Slot.destroy({
    where: {
      doctorId,
      date:   { [Op.gte]: tomorrowStr },
      status: { [Op.ne]: 'booked' },
    },
  });
  return count;
}

module.exports = {
  generateSlotsForDate,
  regenerateSlotsForDate,
  lockSlot,
  releaseExpiredLocks,
  getAvailableSlots,
  getAllSlots,
  clearFutureSlots,
  parseLocalDate,
};
