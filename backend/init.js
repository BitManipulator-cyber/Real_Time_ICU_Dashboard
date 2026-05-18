const mongoose = require("mongoose");
const fs       = require("fs");
const path     = require("path");

const { Patient, Device, VitalReading, ThresholdProfile, Alert, PatientState } =
    require("./models/patient_vitals");

const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data.json"), "utf-8")
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Floor a date to the nearest N-minute window (used for alert dedup)
function dedupWindowStart(date, windowMinutes) {
    const ms = windowMinutes * 60 * 1000;
    return new Date(Math.floor(date.getTime() / ms) * ms);
}

// Evaluate vitals against a threshold profile and return triggered alerts
function evaluateVitals(vitals, profile) {
    const alerts = [];

    const checks = [
        { key: "heart_rate",  high: "HIGH_HEART_RATE",  low: "LOW_HEART_RATE"  },
        { key: "spo2",        high: null,               low: "LOW_SPO2"        },
        { key: "bp_systolic", high: "HIGH_BP_SYSTOLIC", low: "LOW_BP_SYSTOLIC" },
        { key: "temperature", high: "HIGH_TEMPERATURE", low: "LOW_TEMPERATURE" },
        { key: "resp_rate",   high: "HIGH_RESP_RATE",   low: "LOW_RESP_RATE"   },
    ];

    for (const { key, high, low } of checks) {
        const value = vitals[key];
        if (value == null) continue;

        const t = profile[key];

        // Critical check first (wider range = higher priority)
        if (t.critical.max != null && value > t.critical.max && high) {
            alerts.push({ type: high, severity: "CRITICAL", triggered_value: value, threshold: t.critical });
        } else if (t.warning.max != null && value > t.warning.max && high) {
            alerts.push({ type: high, severity: "WARNING",  triggered_value: value, threshold: t.warning  });
        }

        if (t.critical.min != null && value < t.critical.min && low) {
            alerts.push({ type: low, severity: "CRITICAL", triggered_value: value, threshold: t.critical });
        } else if (t.warning.min != null && value < t.warning.min && low) {
            alerts.push({ type: low, severity: "WARNING",  triggered_value: value, threshold: t.warning  });
        }
    }

    return alerts;
}

// Derive RED / YELLOW / GREEN from a list of triggered alert objects
function computeSeverity(triggeredAlerts) {
    if (triggeredAlerts.some(a => a.severity === "CRITICAL")) return "RED";
    if (triggeredAlerts.some(a => a.severity === "WARNING"))  return "YELLOW";
    return "GREEN";
}

// ─── Seed (runs once) ─────────────────────────────────────────────────────────

async function seed() {
    console.log("\n── Seeding base data ───────────────────────────────────────");

    // Clear existing data so re-runs are idempotent
    await Promise.all([
        Patient.deleteMany({}),
        Device.deleteMany({}),
        ThresholdProfile.deleteMany({}),
        VitalReading.deleteMany({}),
        Alert.deleteMany({}),
        PatientState.deleteMany({})
    ]);

    // Insert devices
    const insertedDevices = await Device.insertMany(data.devices);
    const deviceMap = {};
    insertedDevices.forEach(d => { deviceMap[d.device_uid] = d._id; });
    console.log(`✓ ${insertedDevices.length} devices inserted`);

    // Insert patients
    const insertedPatients = await Patient.insertMany(data.patients);
    const patientMap = {};
    insertedPatients.forEach(p => { patientMap[p.mrn] = p._id; });
    console.log(`✓ ${insertedPatients.length} patients inserted`);

    // Insert global threshold profile
    await ThresholdProfile.create(data.thresholdProfile);
    console.log("✓ Global threshold profile inserted");

    // Initialise a GREEN PatientState for every patient
    await PatientState.insertMany(
        insertedPatients.map(p => ({
            patient_id:       p._id,
            severity:         "GREEN",
            latest_vitals:    {},
            active_alert_ids: [],
            updated_at:       new Date()
        }))
    );
    console.log("✓ PatientState initialised for all patients");

    return { patientMap, deviceMap };
}

// ─── Process a single vitals reading ─────────────────────────────────────────

async function processReading(entry, patientMap, deviceMap, profile) {
    const patientId = patientMap[entry.mrn];
    const deviceId  = deviceMap[entry.device_uid];
    const now       = new Date();

    // 1. Save raw reading
    const reading = await VitalReading.create({
        patient_id:       patientId,
        source_device_id: deviceId,
        recorded_at:      now,
        vitals:           entry.vitals
    });

    await Device.findByIdAndUpdate(deviceId, { last_seen_at: now });

    // 2. Evaluate against thresholds
    const triggeredAlerts = evaluateVitals(entry.vitals, profile);
    const severity        = computeSeverity(triggeredAlerts);
    const windowStart     = dedupWindowStart(now, profile.dedup_window_minutes);
    const savedAlertIds   = [];

    // 3. Insert alerts (skip silently on E11000 duplicate — already fired this window)
    for (const alert of triggeredAlerts) {
        try {
            const saved = await Alert.create({
                patient_id:         patientId,
                reading_id:         reading._id,
                type:               alert.type,
                severity:           alert.severity,
                triggered_value:    alert.triggered_value,
                threshold:          alert.threshold,
                dedup_window_start: windowStart,
                status:             "OPEN",
                triggered_at:       now
            });
            savedAlertIds.push(saved._id);
        } catch (err) {
            if (err.code === 11000) {
                // Duplicate alert in this window — expected, skip quietly
            } else {
                throw err;
            }
        }
    }

    // 4. Upsert PatientState (live dashboard doc)
    await PatientState.findOneAndUpdate(
        { patient_id: patientId },
        {
            severity,
            latest_vitals: { ...entry.vitals, recorded_at: now },
            $addToSet: { active_alert_ids: { $each: savedAlertIds } },
            updated_at: now
        },
        { upsert: true, new: true }
    );

    // 5. Console log
    const label = severity === "RED" ? "🔴" : severity === "YELLOW" ? "🟡" : "🟢";
    const alertSummary = triggeredAlerts.length
        ? triggeredAlerts.map(a => `${a.type}(${a.triggered_value})`).join(", ")
        : "all normal";
    console.log(`${label} [${entry.mrn}] ${alertSummary}`);
}

// ─── Real-time stream simulation ──────────────────────────────────────────────

// Slightly mutates vitals on each tick to simulate live sensor noise
function jitter(vitals) {
    const vary = (val, delta) =>
        val != null ? parseFloat((val + (Math.random() * 2 - 1) * delta).toFixed(1)) : null;

    return {
        heart_rate:   vary(vitals.heart_rate,   3),
        spo2:         Math.min(100, vary(vitals.spo2,         1)),
        bp_systolic:  vary(vitals.bp_systolic,  4),
        bp_diastolic: vary(vitals.bp_diastolic, 3),
        temperature:  vary(vitals.temperature,  0.2),
        resp_rate:    vary(vitals.resp_rate,     2)
    };
}

function streamVitals(patientMap, deviceMap, profile, intervalMs = 3000) {
    const stream = [...data.vitalsStream];
    let tick = 0;

    console.log(`\n── Real-time stream started (every ${intervalMs / 1000}s) ──────────────`);
    console.log("    Press Ctrl+C to stop.\n");

    const interval = setInterval(async () => {
        tick++;
        console.log(`\n── Tick ${tick} ─────────────────────────────────────────────────`);

        for (const entry of stream) {
            await processReading(
                { ...entry, vitals: jitter(entry.vitals) },
                patientMap,
                deviceMap,
                profile
            );
        }
    }, intervalMs);

    // Graceful shutdown
    process.on("SIGINT", async () => {
        clearInterval(interval);
        console.log("\n── Stream stopped. Closing connection. ─────────────────────");
        await mongoose.disconnect();
        process.exit(0);
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    await mongoose.connect("mongodb://127.0.0.1:27017/patient_vitals")
        .then(() => console.log("Connected to MongoDB"))
        .catch(e => { console.error(e); process.exit(1); });

    const { patientMap, deviceMap } = await seed();

    const profile = await ThresholdProfile.findOne({ patient_id: null }).lean();

    // Run one immediate tick, then stream every 3 seconds
    console.log("\n── Initial readings ─────────────────────────────────────────");
    for (const entry of data.vitalsStream) {
        await processReading(entry, patientMap, deviceMap, profile);
    }

    streamVitals(patientMap, deviceMap, profile, 3000);
}

main();