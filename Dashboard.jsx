import { useEffect, useMemo, useState } from "react";
import { useVitalsData } from "../hooks/useVitalsData";
import Sidebar from "../components/dashboard/Sidebar";
import OverviewCards from "../components/dashboard/OverviewCards";
import FilterBar from "../components/dashboard/FilterBar";
import PatientGrid from "../components/dashboard/PatientGrid";
import PatientDetail from "../components/dashboard/PatientDetail";
import { NEUTRAL } from "../constants/severity";
import "../styles/dashboard.css";

function OverviewSkeleton() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 16,
      }}
    >
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="skeleton-bar"
          style={{ height: 88, borderRadius: 12 }}
        />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 14,
      }}
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="skeleton-bar"
          style={{ height: 160, borderRadius: 12 }}
        />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const {
    patients,
    connected,
    lastTick,
    loadError,
    initialFetchDone,
    getSeries,
    getTimeline,
  } = useVitalsData();

  const [filterWard, setFilterWard] = useState("ALL");
  const [filterSev, setFilterSev] = useState("ALL");
  const [selectedMrn, setSelectedMrn] = useState(null);

  const wards = useMemo(
    () => ["ALL", ...new Set(patients.map((p) => p.ward).filter(Boolean))],
    [patients]
  );

  const sections = useMemo(() => {
    const w = patients.map((p) => p.ward).filter(Boolean);
    return ["ALL", ...new Set(w)];
  }, [patients]);

  const displayed = useMemo(() => {
    return patients.filter((p) => {
      if (filterWard !== "ALL" && p.ward !== filterWard) return false;
      if (filterSev !== "ALL" && p.severity !== filterSev) return false;
      return true;
    });
  }, [patients, filterWard, filterSev]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.mrn === selectedMrn) || null,
    [patients, selectedMrn]
  );

  useEffect(() => {
    if (selectedMrn && initialFetchDone && !selectedPatient) {
      setSelectedMrn(null);
    }
  }, [selectedMrn, selectedPatient, initialFetchDone]);

  const showSkeleton = !initialFetchDone && patients.length === 0 && !loadError;

  if (selectedMrn && selectedPatient) {
    return (
      <PatientDetail
        patient={selectedPatient}
        series={getSeries(selectedMrn)}
        timeline={getTimeline(selectedMrn)}
        onBack={() => setSelectedMrn(null)}
        lastTick={lastTick}
        connected={connected}
      />
    );
  }

  return (
    <div className="icu-shell" style={{ background: NEUTRAL.pageBg }}>
      <Sidebar
        sections={sections}
        activeSection={filterWard}
        onSelectSection={setFilterWard}
        connected={connected}
      />
      <main className="icu-main" style={{ padding: "20px 24px 40px" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 800,
                  color: NEUTRAL.text,
                  letterSpacing: "-0.02em",
                }}
              >
                ICU monitoring
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: NEUTRAL.muted }}>
                Live vitals from MongoDB via snapshot + SSE (5s ticks)
              </p>
            </div>
            {lastTick && (
              <span style={{ fontSize: 12, color: NEUTRAL.muted, fontWeight: 600 }}>
                Last update: {lastTick.toLocaleTimeString()}
              </span>
            )}
          </div>

          {loadError && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 10,
                background: "#FFE5E5",
                border: "1px solid #D32F2F",
                color: "#B71C1C",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Could not load snapshot: {loadError}
            </div>
          )}

          {showSkeleton ? (
            <>
              <OverviewSkeleton />
              <div className="skeleton-bar" style={{ height: 48, borderRadius: 10, marginBottom: 16 }} />
              <GridSkeleton />
            </>
          ) : (
            <>
              {patients.length > 0 && <OverviewCards patients={patients} />}
              <FilterBar
                filterSev={filterSev}
                setFilterSev={setFilterSev}
                filterWard={filterWard}
                setFilterWard={setFilterWard}
                wards={wards}
                displayedCount={displayed.length}
              />
              <PatientGrid
                patients={displayed}
                onViewMore={(mrn) => setSelectedMrn(mrn)}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
