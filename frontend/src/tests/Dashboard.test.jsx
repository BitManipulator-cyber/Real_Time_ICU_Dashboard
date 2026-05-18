import { render, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import Dashboard from "../pages/Dashboard";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for snapshot
global.fetch = vi.fn();

// Mock EventSource for stream
class MockEventSource {
  constructor(url) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close() {}
}
MockEventSource.instances = [];
global.EventSource = MockEventSource;

const mockSnapshot = [
  {
    mrn: "MRN-1",
    name: { first: "John", last: "Doe" },
    ward: "ICU-A",
    severity: "GREEN",
    vitals: { heart_rate: 75, spo2: 98, bp_systolic: 120, temperature: 37, resp_rate: 16 },
    alerts: [],
    recorded_at: new Date().toISOString()
  },
  {
    mrn: "MRN-2",
    name: { first: "Jane", last: "Smith" },
    ward: "ICU-B",
    severity: "RED",
    vitals: { heart_rate: 140, spo2: 90, bp_systolic: 120, temperature: 37, resp_rate: 16 },
    alerts: [{ severity: "CRITICAL", type: "LOW_SPO2", triggered_value: 90 }],
    recorded_at: new Date().toISOString()
  }
];

describe("Dashboard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances = [];
    fetch.mockResolvedValue({
      json: () => Promise.resolve(mockSnapshot)
    });
  });

  it("should render patient cards with correct details", async () => {
    render(<Dashboard />);
    
    // Wait for the snapshot to load
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });

    // Verify patient wards and MRNs
    expect(screen.getByText("MRN-1")).toBeInTheDocument();
    expect(screen.getByText("MRN-2")).toBeInTheDocument();
    expect(screen.getByText("ICU-A")).toBeInTheDocument();
    expect(screen.getByText("ICU-B")).toBeInTheDocument();
  });

  it("should render vitals correctly", async () => {
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    // Check if HR 75 is rendered (John Doe)
    expect(screen.getAllByText("75").length).toBeGreaterThan(0);
    // Check if HR 140 is rendered (Jane Smith)
    expect(screen.getAllByText("140").length).toBeGreaterThan(0);
  });

  it("should render color-coded alerts correctly based on severity", async () => {
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });

    // Check severity badges
    const criticalBadge = screen.getByText("CRITICAL");
    expect(criticalBadge).toBeInTheDocument();
    
    const stableBadges = screen.getAllByText("STABLE");
    expect(stableBadges.length).toBeGreaterThan(0);

    // Check specific alerts section
    expect(screen.getByText("ACTIVE ALERTS")).toBeInTheDocument();
    expect(screen.getByText(/LOW SPO2/)).toBeInTheDocument();
  });

  it("should update data when EventSource pushes new stream", async () => {
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });

    const es = MockEventSource.instances[0];
    
    // Check initial state
    await waitFor(() => expect(screen.getAllByText("75").length).toBeGreaterThan(0));

    // Simulate SSE push
    const updateEvent = new MessageEvent("message", {
      data: JSON.stringify([{
        mrn: "MRN-1",
        name: { first: "John", last: "Doe" },
        ward: "ICU-A",
        severity: "YELLOW",
        vitals: { heart_rate: 110, spo2: 96, bp_systolic: 120, temperature: 37, resp_rate: 16 },
        alerts: [{ severity: "WARNING", type: "HIGH_HEART_RATE", triggered_value: 110 }],
        recorded_at: new Date().toISOString()
      }])
    });

    act(() => {
      if (es.onmessage) es.onmessage(updateEvent);
    });

    // Wait for the new data to be rendered
    await waitFor(() => {
      expect(screen.getAllByText("110").length).toBeGreaterThan(0);
      expect(screen.getByText("WARNING")).toBeInTheDocument();
      expect(screen.getByText(/HIGH HEART RATE/)).toBeInTheDocument();
    });
  });
});
