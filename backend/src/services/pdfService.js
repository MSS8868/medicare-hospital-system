/**
 * services/pdfService.js
 *
 * PDF generation for appointment slips and prescriptions.
 *
 * PRESCRIPTION FIX:
 *   - Medicines now rendered as a proper table with columns:
 *     No. | Medicine | Dosage | Frequency | Duration | Instructions (before/after food)
 *   - Each medicine gets its own clearly separated row
 *   - "Before food" / "After food" displayed prominently in bold
 *   - Tests shown as a formatted numbered list
 */

const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');

const HOSPITAL_NAME    = process.env.HOSPITAL_NAME    || 'MediCare Multi-Specialty Hospital';
const HOSPITAL_ADDRESS = process.env.HOSPITAL_ADDRESS || '123 Health Avenue, Bangalore, Karnataka 560001';
const HOSPITAL_PHONE   = process.env.HOSPITAL_PHONE   || '+91-80-12345678';

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENT CONFIRMATION PDF
// ─────────────────────────────────────────────────────────────────────────────
async function generateAppointmentPDF(appointment, patient, doctor, department, slot) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc     = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];
      doc.on('data', c => buffers.push(c));
      doc.on('end',  () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // QR code
      const qrData = JSON.stringify({
        appointmentId: appointment.appointmentId,
        patient:       patient.user?.name,
        doctor:        doctor.user?.name,
        date:          appointment.appointmentDate,
        time:          appointment.appointmentTime,
        token:         appointment.tokenNumber,
      });
      const qrBuffer = await QRCode.toBuffer(qrData, { width: 100 });

      // ── Header ────────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 100).fill('#0D47A1');
      doc.fillColor('white').font('Helvetica-Bold').fontSize(20).text(HOSPITAL_NAME, 40, 20);
      doc.font('Helvetica').fontSize(9).text(HOSPITAL_ADDRESS, 40, 48);
      doc.text(`Tel: ${HOSPITAL_PHONE}`, 40, 62);
      doc.image(qrBuffer, doc.page.width - 140, 10, { width: 80 });

      // ── Title ─────────────────────────────────────────────────────────────
      doc.fillColor('#0D47A1').font('Helvetica-Bold').fontSize(16)
         .text('APPOINTMENT CONFIRMATION', 40, 120, { align: 'center' });
      doc.moveTo(40, 145).lineTo(doc.page.width - 40, 145)
         .strokeColor('#0D47A1').lineWidth(2).stroke();

      let y    = 160;
      const c1 = 40, c2 = 300;

      const row = (lbl, val, x, yp) => {
        doc.fillColor('#666').font('Helvetica').fontSize(9).text(lbl, x, yp);
        doc.fillColor('#111').font('Helvetica-Bold').fontSize(10).text(String(val || '-'), x, yp + 13);
      };

      // Appointment details
      doc.fillColor('#0D47A1').font('Helvetica-Bold').fontSize(11).text('Appointment Details', c1, y);
      y += 20;
      row('APPOINTMENT ID',  appointment.appointmentId, c1, y);
      row('TOKEN NUMBER',    `#${appointment.tokenNumber}`, c2, y);
      y += 40;
      row('DATE', new Date(appointment.appointmentDate + 'T00:00:00')
        .toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), c1, y);
      row('TIME', appointment.appointmentTime, c2, y);
      y += 40;
      row('TYPE',   appointment.type === 'new' ? 'New Consultation' : 'Follow-Up', c1, y);
      row('STATUS', appointment.status.toUpperCase(), c2, y);
      y += 50;

      doc.moveTo(c1, y).lineTo(doc.page.width - 40, y).strokeColor('#ddd').lineWidth(1).stroke(); y += 15;

      // Patient details
      doc.fillColor('#0D47A1').font('Helvetica-Bold').fontSize(11).text('Patient Details', c1, y); y += 20;
      row('PATIENT NAME', patient.user?.name,   c1, y);
      row('PATIENT ID',   patient.patientId,    c2, y); y += 40;
      row('GENDER',    patient.gender?.toUpperCase(), c1, y);
      row('BLOOD GROUP', patient.bloodGroup || 'Not specified', c2, y); y += 40;
      row('MOBILE', patient.user?.mobile, c1, y); y += 50;

      doc.moveTo(c1, y).lineTo(doc.page.width - 40, y).strokeColor('#ddd').lineWidth(1).stroke(); y += 15;

      // Doctor details
      doc.fillColor('#0D47A1').font('Helvetica-Bold').fontSize(11).text('Doctor Details', c1, y); y += 20;
      row('DOCTOR NAME',      doctor.user?.name,    c1, y);
      row('DEPARTMENT',       department?.name,     c2, y); y += 40;
      row('SPECIALIZATION',   doctor.specialization, c1, y);
      row('CONSULTATION FEE', `Rs. ${doctor.consultationFee}`, c2, y); y += 60;

      // Instructions box
      doc.rect(c1, y, doc.page.width - 80, 80).fillColor('#EEF2FF').fill();
      doc.fillColor('#0D47A1').font('Helvetica-Bold').fontSize(10)
         .text('Important Instructions', c1 + 10, y + 8);
      doc.fillColor('#333').font('Helvetica').fontSize(8)
         .text('• Please arrive 10 minutes before your appointment time.', c1 + 10, y + 22)
         .text('• Bring this slip and any previous medical records.', c1 + 10, y + 34)
         .text('• Contact us at least 2 hours before to reschedule or cancel.', c1 + 10, y + 46)
         .text('• This slip must be presented at the reception desk.', c1 + 10, y + 58);
      y += 95;

      // Footer
      doc.moveTo(c1, y).lineTo(doc.page.width - 40, y).strokeColor('#0D47A1').lineWidth(1).stroke(); y += 10;
      doc.fillColor('#888').font('Helvetica').fontSize(8)
         .text(`Generated: ${new Date().toLocaleString('en-IN')} | ${HOSPITAL_NAME}`, c1, y, { align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESCRIPTION PDF
// ─────────────────────────────────────────────────────────────────────────────
async function generatePrescriptionPDF(consultation, appointment, patient, doctor) {
  return new Promise((resolve, reject) => {
    try {
      const doc     = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];
      doc.on('data', c => buffers.push(c));
      doc.on('end',  () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Parse JSON fields safely
      const medicines    = Array.isArray(consultation.medicines)    ? consultation.medicines    : [];
      const testsAdvised = Array.isArray(consultation.testsAdvised) ? consultation.testsAdvised : [];
      const vitals       = (consultation.vitals && typeof consultation.vitals === 'object') ? consultation.vitals : {};

      const pageW = doc.page.width;
      const L = 40;          // left margin
      const R = pageW - 40;  // right edge
      const W = R - L;       // usable width

      // ── Header ────────────────────────────────────────────────────────────
      doc.rect(0, 0, pageW, 100).fill('#1B5E20');
      doc.fillColor('white').font('Helvetica-Bold').fontSize(20).text(HOSPITAL_NAME, L, 15);
      doc.font('Helvetica').fontSize(9).text(HOSPITAL_ADDRESS, L, 42);
      doc.text(`Tel: ${HOSPITAL_PHONE}`, L, 55);
      doc.font('Helvetica-Bold').fontSize(11)
         .text('PRESCRIPTION / CONSULTATION NOTES', L, 72, { align: 'right', width: W });

      let y = 115;

      // ── Doctor stamp ──────────────────────────────────────────────────────
      doc.rect(L, y, W, 58).fillColor('#F1F8E9').fill();
      doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(13).text(doctor.user?.name || '', L + 10, y + 8);
      doc.fillColor('#444').font('Helvetica').fontSize(9)
         .text(doctor.qualification  || '',  L + 10, y + 24)
         .text(doctor.specialization || '',  L + 10, y + 36)
         .text(`Reg. No: ${doctor.registrationNumber || 'N/A'}`, L + 10, y + 48);

      const c2 = L + Math.floor(W * 0.55);
      doc.fillColor('#333').font('Helvetica').fontSize(9)
         .text(`Date: ${new Date(consultation.visitDate + 'T00:00:00').toLocaleDateString('en-IN')}`, c2, y + 8)
         .text(`Patient: ${patient.user?.name || ''}`, c2, y + 20)
         .text(`Age/Sex: ${patient.age || '-'} yrs / ${patient.gender || ''}`, c2, y + 32)
         .text(`Patient ID: ${patient.patientId || ''}`, c2, y + 44);
      y += 68;

      // ── Vitals ────────────────────────────────────────────────────────────
      const vitalPairs = [
        ['BP',     vitals.bp     ? `${vitals.bp} mmHg`  : null],
        ['Pulse',  vitals.pulse  ? `${vitals.pulse} bpm` : null],
        ['Temp',   vitals.temp   ? `${vitals.temp} °F`  : null],
        ['Weight', vitals.weight ? `${vitals.weight} kg` : null],
        ['Height', vitals.height ? `${vitals.height} cm` : null],
        ['SpO2',   vitals.spo2   ? `${vitals.spo2}%`    : null],
      ].filter(([, v]) => v);

      if (vitalPairs.length > 0) {
        doc.rect(L, y, W, 22).fillColor('#E8F5E9').fill();
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(9)
           .text('VITALS:', L + 6, y + 6);
        doc.fillColor('#333').font('Helvetica').fontSize(9)
           .text(vitalPairs.map(([k, v]) => `${k}: ${v}`).join('   |   '), L + 54, y + 6);
        y += 28;
        doc.moveTo(L, y).lineTo(R, y).strokeColor('#ccc').lineWidth(0.5).stroke(); y += 8;
      }

      // ── Chief complaint ────────────────────────────────────────────────────
      if (consultation.chiefComplaint) {
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(10).text('Chief Complaint:', L, y);
        y += 14;
        doc.fillColor('#222').font('Helvetica').fontSize(10)
           .text(consultation.chiefComplaint, L + 10, y, { width: W - 10 });
        y += doc.heightOfString(consultation.chiefComplaint, { width: W - 10 }) + 8;
      }

      // ── Symptoms ──────────────────────────────────────────────────────────
      if (consultation.symptoms) {
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(10).text('Symptoms:', L, y);
        if (consultation.duration) {
          doc.fillColor('#666').font('Helvetica').fontSize(9)
             .text(`(since ${consultation.duration})`, L + 80, y + 1);
        }
        y += 14;
        doc.fillColor('#333').font('Helvetica').fontSize(10)
           .text(consultation.symptoms, L + 10, y, { width: W - 10 });
        y += doc.heightOfString(consultation.symptoms, { width: W - 10 }) + 8;
      }

      // ── Diagnosis ─────────────────────────────────────────────────────────
      if (consultation.diagnosis) {
        doc.rect(L, y, W, 24).fillColor('#F0FAF0').fill();
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(10)
           .text('Diagnosis:', L + 6, y + 6);
        doc.fillColor('#111').font('Helvetica-Bold').fontSize(11)
           .text(consultation.diagnosis, L + 80, y + 5, { width: W - 90 });
        y += 32;
      }

      // ── Medicines (RX table) ───────────────────────────────────────────────
      if (medicines.length > 0) {
        y += 4;
        // Section heading with Rx symbol
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(13).text('\u211E  Prescription', L, y);
        y += 20;

        // Table header row
        const cols = {
          no:    { x: L,      w: 22  },
          name:  { x: L + 22, w: 150 },
          dose:  { x: L + 172,w: 62  },
          freq:  { x: L + 234,w: 90  },
          dur:   { x: L + 324,w: 55  },
          instr: { x: L + 379,w: W - 379 },
        };

        // Header background
        doc.rect(L, y, W, 18).fillColor('#C8E6C9').fill();
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(8);
        doc.text('#',            cols.no.x + 4,   y + 5);
        doc.text('MEDICINE',     cols.name.x + 2,  y + 5);
        doc.text('DOSAGE',       cols.dose.x + 2,  y + 5);
        doc.text('FREQUENCY',    cols.freq.x + 2,  y + 5);
        doc.text('DURATION',     cols.dur.x + 2,   y + 5);
        doc.text('INSTRUCTIONS', cols.instr.x + 2, y + 5);
        y += 18;

        // Medicine rows
        medicines.forEach((med, idx) => {
          const isEven = idx % 2 === 0;
          // Estimate row height for this medicine (name might wrap)
          const nameH  = doc.heightOfString(med.name || '', { width: cols.name.w - 4, fontSize: 10 });
          const rowH   = Math.max(nameH + 10, 26);

          // Alternating row background
          doc.rect(L, y, W, rowH).fillColor(isEven ? '#FFFFFF' : '#F9FBF9').fill();

          // Bottom border
          doc.moveTo(L, y + rowH).lineTo(R, y + rowH).strokeColor('#ddd').lineWidth(0.5).stroke();

          // Content
          const yc = y + 6; // vertical centre for single-line text

          // Serial number
          doc.fillColor('#555').font('Helvetica-Bold').fontSize(9)
             .text(String(idx + 1), cols.no.x + 6, yc);

          // Medicine name — bold, may wrap
          doc.fillColor('#111').font('Helvetica-Bold').fontSize(10)
             .text(med.name || '', cols.name.x + 2, yc, { width: cols.name.w - 4 });

          // Dosage
          doc.fillColor('#222').font('Helvetica').fontSize(9)
             .text(med.dosage || '-', cols.dose.x + 2, yc, { width: cols.dose.w - 4 });

          // Frequency
          doc.fillColor('#222').font('Helvetica').fontSize(9)
             .text(med.frequency || '-', cols.freq.x + 2, yc, { width: cols.freq.w - 4 });

          // Duration
          doc.fillColor('#222').font('Helvetica').fontSize(9)
             .text(med.duration || '-', cols.dur.x + 2, yc, { width: cols.dur.w - 4 });

          // Instructions — highlight before/after food in a coloured pill
          const instr = (med.instructions || '').toLowerCase();
          if (instr) {
            const isAfter  = instr.includes('after');
            const isBefore = instr.includes('before');
            const bgColor  = isBefore ? '#FFF3E0' : isAfter ? '#E8F5E9' : '#EEE';
            const txtColor = isBefore ? '#E65100' : isAfter ? '#2E7D32' : '#555';
            const display  = isBefore ? 'After Food' :     // doctors often mean "after food" by "AF"
                             isAfter  ? 'After Food'  :
                             med.instructions;
            const finalDisplay = med.instructions; // always show exact text

            // Small pill background
            const instrW = Math.min(cols.instr.w - 8, 80);
            doc.rect(cols.instr.x + 2, yc, instrW, 14).fillColor(bgColor).fill();
            doc.fillColor(txtColor).font('Helvetica-Bold').fontSize(8)
               .text(finalDisplay, cols.instr.x + 4, yc + 3, { width: instrW - 4 });
          } else {
            doc.fillColor('#999').font('Helvetica').fontSize(8)
               .text('-', cols.instr.x + 2, yc);
          }

          y += rowH;
        });

        y += 10;
      }

      // ── Tests advised ─────────────────────────────────────────────────────
      if (testsAdvised.length > 0) {
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(11).text('Tests Advised', L, y); y += 14;
        doc.rect(L, y, W, testsAdvised.length * 17 + 8).fillColor('#F3E5F5').fill();
        testsAdvised.forEach((test, i) => {
          doc.fillColor('#4A148C').font('Helvetica').fontSize(10)
             .text(`${i + 1}.  ${test.name || test}`, L + 8, y + 4 + i * 17);
        });
        y += testsAdvised.length * 17 + 14;
      }

      // ── Clinical notes ────────────────────────────────────────────────────
      if (consultation.clinicalNotes) {
        doc.fillColor('#1B5E20').font('Helvetica-Bold').fontSize(10).text('Clinical Notes', L, y); y += 14;
        doc.fillColor('#555').font('Helvetica').fontSize(9)
           .text(consultation.clinicalNotes, L + 6, y, { width: W - 6 });
        y += doc.heightOfString(consultation.clinicalNotes, { width: W - 6 }) + 10;
      }

      // ── Follow-up date ────────────────────────────────────────────────────
      if (consultation.followUpDate) {
        y += 4;
        doc.rect(L, y, W, 28).fillColor('#FFF8E1').fill();
        doc.fillColor('#E65100').font('Helvetica-Bold').fontSize(10)
           .text('Follow-up Date:', L + 10, y + 8);
        doc.fillColor('#BF360C').font('Helvetica-Bold').fontSize(11)
           .text(
              new Date(consultation.followUpDate + 'T00:00:00')
                .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
              L + 110, y + 7,
            );
        if (consultation.followUpNotes) {
          doc.fillColor('#555').font('Helvetica').fontSize(9)
             .text(`Note: ${consultation.followUpNotes}`, L + 10, y + 20);
        }
        y += 36;
      }

      // ── Doctor signature ──────────────────────────────────────────────────
      const sigY = Math.max(y + 20, doc.page.height - 110);
      doc.moveTo(c2, sigY).lineTo(R, sigY).strokeColor('#333').lineWidth(0.5).stroke();
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(9)
         .text(doctor.user?.name || '', c2, sigY + 5, { width: R - c2, align: 'center' });
      doc.fillColor('#666').font('Helvetica').fontSize(8)
         .text("Doctor's Signature & Stamp", c2, sigY + 17, { width: R - c2, align: 'center' });

      // ── Footer ────────────────────────────────────────────────────────────
      const footerY = doc.page.height - 32;
      doc.moveTo(L, footerY).lineTo(R, footerY).strokeColor('#1B5E20').lineWidth(1).stroke();
      doc.fillColor('#888').font('Helvetica').fontSize(7)
         .text(
            `This prescription is valid for 30 days. | ${HOSPITAL_NAME} | Generated: ${new Date().toLocaleString('en-IN')}`,
            L, footerY + 6, { align: 'center', width: W },
          );

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { generateAppointmentPDF, generatePrescriptionPDF };
