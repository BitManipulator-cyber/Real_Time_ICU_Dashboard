const mongoose = require("mongoose");
vitalReadingSchema.index({ patient_id: 1, recorded_at: -1 });
// ─── Connection ───────────────────────────────────────────────────────────────

mongoose.connect("mongodb://127.0.0.1:27017/patient_vitals")
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((e) => {
        console.log(e);
    });

// ─── Patient ──────────────────────────────────────────────────────────────────

const patientSchema = new mongoose.Schema({
    mrn: {
      type: String,
     required: true,
     unique: true,
     trim: true
    },
    name: {
        first: { type: String, required: true },
        last:  { type: String, required: true }
    },
    date_of_birth: {
        type: Date,
        required: true
    },
    sex: {
        type: String,
        enum: ["M", "F", "Other"],
        required: true
    },
    ward: {
        type: String,
        required: true
    },
    admitted_at: {
        type: Date,
        default: Date.now
    },
    discharged_at: {
        type: Date,
        default: null
    }
});

const Patient = mongoose.model("Patient", patientSchema);

// ─── Device ───────────────────────────────────────────────────────────────────

const deviceSchema = new mongoose.Schema({
    device_uid: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ["PULSE_OX", "ECG_MONITOR", "BP_CUFF", "TEMP_SENSOR", "MANUAL", "MULTI_PARAM"],
        required: true
    },
    ward: {
        type: String,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    },
    last_seen_at: {
        type: Date,
        default: null
    }
});

const Device = mongoose.model("Device", deviceSchema);

// ─── VitalReading ─────────────────────────────────────────────────────────────

const vitalReadingSchema = new mongoose.Schema({
    patient_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        required: true
    },
    source_device_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Device",
        required: true
    },
    recorded_at: {
        type: Date,
        default: Date.now
    },
    vitals: {
        heart_rate:   { type: Number, default: null }, // bpm
        spo2:         { type: Number, default: null }, // % oxygen saturation
        bp_systolic:  { type: Number, default: null }, // mmHg
        bp_diastolic: { type: Number, default: null }, // mmHg
        temperature:  { type: Number, default: null }, // °C
        resp_rate:    { type: Number, default: null }  // breaths/min
    }
});

const VitalReading = mongoose.model("VitalReading", vitalReadingSchema);

// ─── ThresholdProfile ─────────────────────────────────────────────────────────

const thresholdProfileSchema = new mongoose.Schema({
    // null = global default, ObjectId = patient-specific override
    patient_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        default: null,
        unique: true
    },
    heart_rate: {
        warning:  { min: Number, max: Number },
        critical: { min: Number, max: Number }
    },
    spo2: {
        warning:  { min: Number },
        critical: { min: Number }
    },
    bp_systolic: {
        warning:  { min: Number, max: Number },
        critical: { min: Number, max: Number }
    },
    temperature: {
        warning:  { min: Number, max: Number },
        critical: { min: Number, max: Number }
    },
    resp_rate: {
        warning:  { min: Number, max: Number },
        critical: { min: Number, max: Number }
    },
    dedup_window_minutes: {
        type: Number,
        default: 15
    }
});

const ThresholdProfile = mongoose.model("ThresholdProfile", thresholdProfileSchema);

// ─── Alert ────────────────────────────────────────────────────────────────────

const alertSchema = new mongoose.Schema({
    patient_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        required: true
    },
    reading_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VitalReading",
        required: true
    },
    type: {
        type: String,
        enum: [
            "HIGH_HEART_RATE", "LOW_HEART_RATE",
            "LOW_SPO2",
            "HIGH_BP_SYSTOLIC", "LOW_BP_SYSTOLIC",
            "HIGH_TEMPERATURE", "LOW_TEMPERATURE",
            "HIGH_RESP_RATE",   "LOW_RESP_RATE"
        ],
        required: true
    },
    severity: {
        type: String,
        enum: ["WARNING", "CRITICAL"],
        required: true
    },
    triggered_value: {
        type: Number,
        required: true
    },
    threshold: {
        min: { type: Number, default: null },
        max: { type: Number, default: null }
    },
    dedup_window_start: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"],
        default: "OPEN"
    },
    triggered_at: {
        type: Date,
        default: Date.now
    },
    resolved_at: {
        type: Date,
        default: null
    }
});

// Dedup: one alert per patient + type + time window
alertSchema.index({ patient_id: 1, type: 1, dedup_window_start: 1 }, { unique: true });

const Alert = mongoose.model("Alert", alertSchema);

// ─── PatientState ─────────────────────────────────────────────────────────────

const patientStateSchema = new mongoose.Schema({
    patient_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Patient",
        required: true,
        unique: true
    },
    // Drives RED / YELLOW / GREEN on the dashboard
    severity: {
        type: String,
        enum: ["GREEN", "YELLOW", "RED"],
        default: "GREEN"
    },
    latest_vitals: {
        heart_rate:   { type: Number, default: null },
        spo2:         { type: Number, default: null },
        bp_systolic:  { type: Number, default: null },
        bp_diastolic: { type: Number, default: null },
        temperature:  { type: Number, default: null },
        resp_rate:    { type: Number, default: null },
        recorded_at:  { type: Date,   default: null }
    },
    active_alert_ids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Alert"
    }],
    updated_at: {
        type: Date,
        default: Date.now
    }
});

const PatientState = mongoose.model("PatientState", patientStateSchema);

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { Patient, Device, VitalReading, ThresholdProfile, Alert, PatientState };
