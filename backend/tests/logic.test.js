const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const { Patient, Device, VitalReading, ThresholdProfile, Alert, PatientState } = require("../models/patient_vitals");
const fs = require("fs");
const path = require("path");

let mongoServer;

// Load internal functions from index.js via eval to test logic without app startup
const indexCode = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
// Extract evaluateVitals and computeSeverity functions
const evaluateVitalsMatch = indexCode.match(/function evaluateVitals\([\s\S]*?return alerts;\n}/);
const computeSeverityMatch = indexCode.match(/function computeSeverity\([\s\S]*?return "GREEN";\n}/);

const evaluateVitals = new Function(`return ${evaluateVitalsMatch[0]}`)();
const computeSeverity = new Function(`return ${computeSeverityMatch[0]}`)();

describe("Threshold Logic & Persistence", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Patient.deleteMany({});
    await VitalReading.deleteMany({});
    await Alert.deleteMany({});
  });

  const profile = {
    heart_rate: { warning: { min: 55, max: 100 }, critical: { min: 45, max: 130 } },
    spo2: { warning: { min: 95 }, critical: { min: 91 } },
    bp_systolic: { warning: { min: 95, max: 150 }, critical: { min: 85, max: 175 } },
    temperature: { warning: { min: 36.2, max: 37.8 }, critical: { min: 35.2, max: 39.2 } },
    resp_rate: { warning: { min: 12, max: 20 }, critical: { min: 9, max: 28 } }
  };

  it("should classify vitals as WARNING correctly", () => {
    const vitals = { heart_rate: 110, spo2: 96, bp_systolic: 120, temperature: 37, resp_rate: 16 };
    const alerts = evaluateVitals(vitals, profile);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe("WARNING");
    expect(alerts[0].type).toBe("HIGH_HEART_RATE");
  });

  it("should classify vitals as CRITICAL correctly", () => {
    const vitals = { heart_rate: 75, spo2: 89, bp_systolic: 120, temperature: 37, resp_rate: 16 };
    const alerts = evaluateVitals(vitals, profile);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe("CRITICAL");
    expect(alerts[0].type).toBe("LOW_SPO2");
  });

  it("should compute severity RED for any CRITICAL alerts", () => {
    const alerts = [
      { severity: "WARNING", type: "HIGH_HEART_RATE" },
      { severity: "CRITICAL", type: "LOW_SPO2" }
    ];
    expect(computeSeverity(alerts)).toBe("RED");
  });

  it("should compute severity YELLOW for only WARNING alerts", () => {
    const alerts = [
      { severity: "WARNING", type: "HIGH_HEART_RATE" }
    ];
    expect(computeSeverity(alerts)).toBe("YELLOW");
  });

  it("should persist vitals and alerts correctly without duplicates", async () => {
    const p1 = await Patient.create({
      mrn: "MRN-PERSIST",
      name: { first: "Jane", last: "Doe" },
      date_of_birth: new Date("1990-01-01"),
      sex: "F",
      ward: "ICU-B"
    });
    
    // Simulate tick() behavior
    const now = new Date();
    const reading = await VitalReading.create({
      patient_id: p1._id,
      source_device_id: new mongoose.Types.ObjectId(),
      recorded_at: now,
      vitals: { heart_rate: 140, spo2: 95, bp_systolic: 120, bp_diastolic: 80, temperature: 37, resp_rate: 16 }
    });

    expect(reading._id).toBeDefined();

    // Insert alert
    const alertData = {
      patient_id: p1._id,
      reading_id: reading._id,
      type: "HIGH_HEART_RATE",
      severity: "CRITICAL",
      triggered_value: 140,
      dedup_window_start: now,
      status: "OPEN"
    };

    const savedAlert1 = await Alert.create(alertData);
    expect(savedAlert1._id).toBeDefined();

    // Attempt to insert duplicate alert
    let duplicateError = null;
    try {
      await Alert.create(alertData);
    } catch (err) {
      duplicateError = err;
    }
    
    expect(duplicateError).toBeDefined();
    expect(duplicateError.code).toBe(11000); // duplicate key error
  });
});
