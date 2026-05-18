const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");

const { Patient, Device, VitalReading, ThresholdProfile, Alert, PatientState } =
    require("./models/patient_vitals");

const app  = express();
const PORT = 3000;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// ─── DB Connection ────────────────────────────────────────────────────────────

mongoose.connect("mongodb://127.0.0.1:27017/patient_vitals")
    .then(() => console.log("Connected to MongoDB"))
    .catch(e  => { console.error(e); process.exit(1); });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupWindowStart(date, windowMinutes) {
    const ms = windowMinutes * 60 * 1000;
    return new Date(Math.floor(date.getTime() / ms) * ms);
}

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
        if (t.critical.max != null && value > t.critical.max && high)
            alerts.push({ type: high, severity: "CRITICAL", triggered_value: value, threshold: t.critical });
        else if (t.warning.max != null && value > t.warning.max && high)
            alerts.push({ type: high, severity: "WARNING",  triggered_value: value, threshold: t.warning  });
        if (t.critical.min != null && value < t.critical.min && low)
            alerts.push({ type: low, severity: "CRITICAL", triggered_value: value, threshold: t.critical });
        else if (t.warning.min != null && value < t.warning.min && low)
            alerts.push({ type: low, severity: "WARNING",  triggered_value: value, threshold: t.warning  });
    }
    return alerts;
}

function computeSeverity(triggeredAlerts) {
    if (triggeredAlerts.some(a => a.severity === "CRITICAL")) return "RED";
    if (triggeredAlerts.some(a => a.severity === "WARNING"))  return "YELLOW";
    return "GREEN";
}

// Jitter: small random drift on every tick to simulate live sensor noise
function jitter(vitals) {
    const vary = (val, delta) =>
        val != null ? parseFloat((val + (Math.random() * 2 - 1) * delta).toFixed(1)) : null;
    return {
        heart_rate:   vary(vitals.heart_rate,   4),
        spo2:         Math.min(100, vary(vitals.spo2, 1)),
        bp_systolic:  vary(vitals.bp_systolic,  5),
        bp_diastolic: vary(vitals.bp_diastolic, 3),
        temperature:  vary(vitals.temperature,  0.2),
        resp_rate:    vary(vitals.resp_rate,     2),
    };
}

// ─── In-memory baseline (loaded once from DB on startup) ──────────────────────

let patientBaselines = [];   // [{ patient, device, vitals }]
let thresholdProfile = null;
let sseClients       = [];   // active SSE response objects

async function loadBaselines() {
    thresholdProfile = await ThresholdProfile.findOne({ patient_id: null }).lean();

    const states = await PatientState.find({})
        .populate("patient_id")
        .lean();

    patientBaselines = states
        .filter(s => s.patient_id)
        .map(s => ({
            patient: s.patient_id,
            vitals:  s.latest_vitals || {
                heart_rate: 75, spo2: 98, bp_systolic: 120,
                bp_diastolic: 80, temperature: 37.0, resp_rate: 16
            }
        }));

    console.log(`Loaded ${patientBaselines.length} patient baselines.`);
}

// ─── Core tick: generate + persist + broadcast ────────────────────────────────

async function tick() {
    if (!thresholdProfile || patientBaselines.length === 0) return;

    const payload = [];

    for (const baseline of patientBaselines) {
        const newVitals = jitter(baseline.vitals);
        baseline.vitals = newVitals; // drift the baseline forward

        const now          = new Date();
        const patientId    = baseline.patient._id;

        // Find a device for this patient's ward (best effort)
        const device = await Device.findOne({ ward: baseline.patient.ward, active: true }).lean();
        if (!device) continue;

        // Save reading
        const reading = await VitalReading.create({
            patient_id:       patientId,
            source_device_id: device._id,
            recorded_at:      now,
            vitals:           newVitals,
        });

        await Device.findByIdAndUpdate(device._id, { last_seen_at: now });

        // Evaluate & alert
        const triggered    = evaluateVitals(newVitals, thresholdProfile);
        const severity     = computeSeverity(triggered);
        const windowStart  = dedupWindowStart(now, thresholdProfile.dedup_window_minutes);
        const savedAlerts  = [];

        for (const alert of triggered) {
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
                    triggered_at:       now,
                });
                savedAlerts.push(saved);
            } catch (err) {
                if (err.code !== 11000) throw err; // ignore dedup collisions
            }
        }

        // Upsert live state
        await PatientState.findOneAndUpdate(
            { patient_id: patientId },
            {
                severity,
                latest_vitals: { ...newVitals, recorded_at: now },
                $addToSet: { active_alert_ids: { $each: savedAlerts.map(a => a._id) } },
                updated_at: now,
            },
            { upsert: true, new: true }
        );

        payload.push({
            mrn:      baseline.patient.mrn,
            name:     baseline.patient.name,
            ward:     baseline.patient.ward,
            severity,
            vitals:   newVitals,
            alerts:   triggered,
            recorded_at: now,
        });
    }

    // Broadcast to all connected SSE clients
    const event = `data: ${JSON.stringify(payload)}\n\n`;
    sseClients.forEach(res => res.write(event));
    console.log(`[tick] Sent to ${sseClients.length} client(s)`);
}

// ─── SSE endpoint ─────────────────────────────────────────────────────────────

app.get("/api/vitals/stream", (req, res) => {
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.flushHeaders();

    // Send a heartbeat comment immediately so the browser doesn't wait
    res.write(": connected\n\n");

    sseClients.push(res);
    console.log(`SSE client connected. Total: ${sseClients.length}`);

    req.on("close", () => {
        sseClients = sseClients.filter(c => c !== res);
        console.log(`SSE client disconnected. Total: ${sseClients.length}`);
    });
});

// ─── REST: initial snapshot (Dashboard fetches this on mount) ─────────────────

app.get("/api/vitals/snapshot", async (req, res) => {
    try {
        const states = await PatientState.find({})
            .populate("patient_id", "mrn name ward")
            .lean();

        const snapshot = states
            .filter(s => s.patient_id)
            .map(s => ({
                mrn:         s.patient_id.mrn,
                name:        s.patient_id.name,
                ward:        s.patient_id.ward,
                severity:    s.severity,
                vitals:      s.latest_vitals,
                recorded_at: s.updated_at,
                alerts:      [],
            }));

        res.json(snapshot);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await loadBaselines();

    // Tick every 5 seconds
    setInterval(tick, 5000);
});