# Real-Time ICU Dashboard

A comprehensive, real-time monitoring system designed for Intensive Care Units (ICU). This dashboard continuously tracks and evaluates patient vitals (Heart Rate, SpO2, Blood Pressure, Temperature, and Respiratory Rate), generating real-time alerts for critical conditions and providing medical staff with live updates.

## Architecture

The system follows a modern client-server architecture with Server-Sent Events (SSE) for low-latency real-time data streaming.

```mermaid
graph TD
    Client[React Frontend] <-->|Server-Sent Events (SSE)| Server[Express.js Backend]
    Server <-->|Mongoose ODM| DB[(MongoDB)]
    
    subgraph Backend
    Server
    Simulator[Vitals Simulator/Jitter] --> Server
    Alerting[Threshold Evaluation] --> Server
    end
```

## Features

- **Real-Time Vitals Streaming**: Uses Server-Sent Events (SSE) to push vitals data to the frontend every 5 seconds.
- **Dynamic Threshold Alerting**: Automatically evaluates patient vitals against customizable thresholds (Warning / Critical).
- **Patient Severity Triage**: Patients are color-coded (RED, YELLOW, GREEN) based on their real-time alert status.
- **Data Persistence**: Automatically stores vital readings and triggered alerts in a MongoDB database for historical analysis and deduplication.

## Tech Stack

- **Frontend**: React.js, Vite
- **Backend**: Node.js, Express.js, Server-Sent Events (SSE)
- **Database**: MongoDB, Mongoose ODM

---

## Prerequisites

- **Node.js**: (v18.x or above recommended)
- **MongoDB**: A running local MongoDB instance (default port `27017`) or a remote MongoDB URI.

## Installation & Setup

### 1. Database Setup
Ensure you have MongoDB running locally on `mongodb://127.0.0.1:27017/patient_vitals`.

### 2. Backend Setup

Navigate to the `backend` directory, install dependencies, and run the server:

```bash
cd backend
npm install
npm start # or node index.js
```

> **Note**: To seed the database with initial patient data and thresholds, run `node init.js` before starting the main server.

The backend server will run on `http://localhost:3000`.

### 3. Frontend Setup

Navigate to the `frontend` directory, install dependencies, and start the development server:

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:5173`.

---

## API Endpoints

- `GET /api/vitals/stream`: Subscribes the client to the SSE real-time data stream.
- `GET /api/vitals/snapshot`: Fetches the current, latest state of all patients (useful for initial client mount).

## License
MIT License
