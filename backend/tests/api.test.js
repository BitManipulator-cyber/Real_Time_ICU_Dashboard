const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

let mongoServer;
let testApp;
let originalListen;

// Mock Express to capture the app instance and prevent listening on real port
jest.mock("express", () => {
  const actualExpress = jest.requireActual("express");
  const expressMock = () => {
    const app = actualExpress();
    global.__TEST_APP__ = app;
    app.listen = jest.fn((port, cb) => {
      // Execute the callback immediately to run loadBaselines
      if (cb) cb();
      return { close: jest.fn() };
    });
    return app;
  };
  Object.assign(expressMock, actualExpress);
  return expressMock;
});

// Mock Mongoose connect
const originalConnect = mongoose.connect;
mongoose.connect = jest.fn(async () => {
  const uri = mongoServer.getUri();
  return originalConnect.call(mongoose, uri);
});

describe("Real-Time ICU Dashboard API", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    
    // We must require index.js AFTER mocking express and mongoose
    require("../index.js");
    testApp = global.__TEST_APP__;
    
    // Need to wait briefly for loadBaselines to finish as it's async inside app.listen
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections and seed data
    const { Patient, Device, PatientState, ThresholdProfile } = require("../models/patient_vitals");
    await Patient.deleteMany({});
    await Device.deleteMany({});
    await PatientState.deleteMany({});
    await ThresholdProfile.deleteMany({});
    
    const p1 = await Patient.create({
      mrn: "MRN-123",
      name: { first: "John", last: "Doe" },
      date_of_birth: new Date("1980-01-01"),
      sex: "M",
      ward: "ICU-A"
    });
    
    await PatientState.create({
      patient_id: p1._id,
      severity: "GREEN",
      latest_vitals: { heart_rate: 75, spo2: 98, bp_systolic: 120, bp_diastolic: 80, temperature: 37, resp_rate: 16 }
    });
  });

  it("GET /api/vitals/snapshot should return JSON with current patient data", async () => {
    const response = await request(testApp).get("/api/vitals/snapshot");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBe(1);
    expect(response.body[0].mrn).toBe("MRN-123");
    expect(response.body[0].severity).toBe("GREEN");
  });

  it("GET /api/vitals/stream should return Content-Type: text/event-stream", (done) => {
    request(testApp)
      .get("/api/vitals/stream")
      .expect("Content-Type", /text\/event-stream/)
      .expect(200)
      .buffer(false)
      .parse((res, callback) => {
        res.on('data', (chunk) => {
          const str = chunk.toString();
          if (str.includes(": connected")) {
            // Successfully connected to SSE
            res.destroy(); // end the stream early
            callback(null, str);
          }
        });
        res.on('end', () => {
          done();
        });
      })
      .end((err) => {
        if (err) return done(err);
      });
  });
});
