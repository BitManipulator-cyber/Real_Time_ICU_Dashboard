import { useEffect, useRef, useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:          "#EFF3F8",
  surface:     "#FFFFFF",
  surfaceAlt:  "#F7FAFC",
  border:      "#DDE3EC",
  borderHard:  "#C4CDD9",
  navy:        "#0D1F3C",
  navyMid:     "#1E3A5F",
  steel:       "#4A5E7A",
  muted:       "#7A8FA6",
  mutedLight:  "#AABCCD",
  red:         "#C0392B",
  redBg:       "#FFF5F5",
  redBorder:   "#F5B7B1",
  redLight:    "#FADBD8",
  amber:       "#D35400",
  amberBg:     "#FFFBF2",
  amberBorder: "#FAD7A0",
  amberLight:  "#FDEBD0",
  green:       "#0E7C6E",
  greenBg:     "#F0FAF8",
  greenBorder: "#A2D9CE",
  greenLight:  "#D1F2EB",
  accent:      "#1558B0",
  accentBg:    "#EBF2FF",
  accentBorder:"#AEC6EF",
};

const SEV = {
  RED:    { label: "Critical", color: C.red,   bg: C.redBg,   border: C.redBorder,   light: C.redLight,   dot: C.red    },
  YELLOW: { label: "Warning",  color: C.amber, bg: C.amberBg, border: C.amberBorder, light: C.amberLight, dot: C.amber  },
  GREEN:  { label: "Stable",   color: C.green, bg: C.greenBg, border: C.greenBorder, light: C.greenLight, dot: C.green  },
};

const VITALS = [
  { key: "heart_rate",   abbr: "HR",   label: "Heart Rate",   unit: "bpm",  icon: "♥",
    warn: v => v > 100 || v < 55,  crit: v => v > 130 || v < 45  },
  { key: "spo2",         abbr: "SpO₂", label: "Oxygen Sat.",  unit: "%",    icon: "◉",
    warn: v => v < 95,              crit: v => v < 91              },
  { key: "bp_systolic",  abbr: "SBP",  label: "Systolic BP",  unit: "mmHg", icon: "↑",
    warn: v => v > 150 || v < 95,  crit: v => v > 175 || v < 85  },
  { key: "bp_diastolic", abbr: "DBP",  label: "Diastolic BP", unit: "mmHg", icon: "↓",
    warn: v => v > 95  || v < 55,  crit: v => v > 110 || v < 45  },
  { key: "temperature",  abbr: "TEMP", label: "Temperature",  unit: "°C",   icon: "⬡",
    warn: v => v > 37.8 || v < 36.2, crit: v => v > 39.2 || v < 35.2 },
  { key: "resp_rate",    abbr: "RR",   label: "Resp. Rate",   unit: "/min", icon: "≋",
    warn: v => v > 20  || v < 12,  crit: v => v > 28  || v < 9   },
];

function vitalStatus(meta, v) {
  if (v == null) return "normal";
  if (meta.crit(v)) return "critical";
  if (meta.warn(v)) return "warning";
  return "normal";
}

// ─── Flash hook ───────────────────────────────────────────────────────────────

function useFlash(value) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(undefined);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== value) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return flash;
}

// ─── Vital tile ───────────────────────────────────────────────────────────────

function VitalTile({ meta, value }) {
  const flash  = useFlash(value);
  const status = vitalStatus(meta, value);

  const valueColor =
    status === "critical" ? C.red :
    status === "warning"  ? C.amber : C.navyMid;

  const flashBg =
    status === "critical" ? C.redLight :
    status === "warning"  ? C.amberLight : C.accentBg;

  const tileBorder =
    status === "critical" ? C.redBorder :
    status === "warning"  ? C.amberBorder : C.border;

  return (
    <div style={{
      flex: "1 1 90px", minWidth: 90,
      display: "flex", flexDirection: "column",
      background: flash ? flashBg : C.surfaceAlt,
      border: `1px solid ${flash ? tileBorder : C.border}`,
      borderTop: `3px solid ${status === "critical" ? C.red : status === "warning" ? C.amber : C.borderHard}`,
      borderRadius: 8,
      padding: "10px 12px 10px",
      transition: "background 0.5s, border-color 0.4s",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: C.muted,
        letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 8,
      }}>
        {meta.abbr}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 700, lineHeight: 1,
        color: valueColor,
        fontFamily: "'Roboto Mono', 'Courier New', monospace",
        transition: "color 0.4s",
      }}>
        {value != null ? value : "—"}
      </div>
      <div style={{ fontSize: 10, color: C.mutedLight, marginTop: 4, fontWeight: 500 }}>
        {meta.unit}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
        {meta.label}
      </div>
    </div>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const s = SEV[severity] || SEV.GREEN;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: s.bg, border: `1.5px solid ${s.border}`,
      borderRadius: 6, padding: "5px 11px",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: s.dot, flexShrink: 0,
        animation: severity !== "GREEN" ? "blink 1.6s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: "0.08em" }}>
        {s.label.toUpperCase()}
      </span>
    </div>
  );
}

// ─── Patient card ─────────────────────────────────────────────────────────────

function PatientCard({ patient, index }) {
  const s = SEV[patient.severity] || SEV.GREEN;

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${patient.severity !== "GREEN" ? s.border : C.border}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: patient.severity === "RED"
        ? "0 4px 20px rgba(192,57,43,0.10), 0 1px 4px rgba(0,0,0,0.05)"
        : "0 1px 4px rgba(0,0,0,0.06)",
      transition: "box-shadow 0.4s, border-color 0.4s",
      animation: "fadeUp 0.3s ease both",
      animationDelay: `${index * 35}ms`,
    }}>

      {/* Severity stripe */}
      <div style={{ height: 4, background: s.color }} />

      {/* Header */}
      <div style={{
        padding: "14px 18px 13px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${C.border}`,
        background: patient.severity !== "GREEN" ? s.bg : C.surface,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, letterSpacing: "-0.01em" }}>
            {patient.name.first} {patient.name.last}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Roboto Mono', monospace", fontWeight: 600 }}>
              {patient.mrn}
            </span>
            <span style={{ color: C.border, fontWeight: 400 }}>|</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: C.accent,
              background: C.accentBg, border: `1px solid ${C.accentBorder}`,
              borderRadius: 4, padding: "2px 8px", letterSpacing: "0.07em",
            }}>
              {patient.ward.toUpperCase()}
            </span>
          </div>
        </div>
        <SeverityBadge severity={patient.severity} />
      </div>

      {/* Vitals */}
      <div style={{ padding: "14px 18px 16px", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {VITALS.map(meta => (
          <VitalTile key={meta.key} meta={meta} value={patient.vitals?.[meta.key]} />
        ))}
      </div>

      {/* Alerts row */}
      {patient.alerts && patient.alerts.length > 0 && (
        <div style={{
          padding: "10px 18px 12px",
          borderTop: `1px solid ${C.border}`,
          background: C.surfaceAlt,
          display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap",
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: C.muted,
            letterSpacing: "0.09em", paddingTop: 3,
          }}>
            ACTIVE ALERTS
          </span>
          {patient.alerts.map((a, i) => (
            <span key={i} style={{
              fontSize: 10, fontWeight: 600,
              padding: "3px 9px", borderRadius: 4,
              background: a.severity === "CRITICAL" ? C.redLight   : C.amberLight,
              border:     `1px solid ${a.severity === "CRITICAL" ? C.redBorder  : C.amberBorder}`,
              color:      a.severity === "CRITICAL" ? C.red        : C.amber,
              letterSpacing: "0.04em",
            }}>
              {a.type.replace(/_/g, " ")} · {a.triggered_value}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: "8px 18px",
        borderTop: `1px solid ${C.border}`,
        background: C.surfaceAlt,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 10, color: C.mutedLight }}>Last reading</span>
        <span style={{
          fontSize: 10, fontWeight: 600, color: C.muted,
          fontFamily: "'Roboto Mono', monospace",
        }}>
          {patient.recorded_at ? new Date(patient.recorded_at).toLocaleTimeString() : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ patients }) {
  const counts = { RED: 0, YELLOW: 0, GREEN: 0 };
  patients.forEach(p => { counts[p.severity] = (counts[p.severity] || 0) + 1; });

  const items = [
    { label: "Critical Patients",  value: counts.RED,     color: C.red,   bg: C.redBg,   border: C.redBorder   },
    { label: "Warning Patients",   value: counts.YELLOW,  color: C.amber, bg: C.amberBg, border: C.amberBorder },
    { label: "Stable Patients",    value: counts.GREEN,   color: C.green, bg: C.greenBg, border: C.greenBorder },
    { label: "Total Monitored",    value: patients.length, color: C.accent, bg: C.accentBg, border: C.accentBorder },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: item.bg,
          border: `1px solid ${item.border}`,
          borderRadius: 10,
          padding: "16px 20px",
        }}>
          <div style={{
            fontSize: 32, fontWeight: 800, color: item.color,
            fontFamily: "'Roboto Mono', monospace", lineHeight: 1,
          }}>
            {item.value}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginTop: 6, letterSpacing: "0.05em" }}>
            {item.label.toUpperCase()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const SORT_ORDER = { RED: 0, YELLOW: 1, GREEN: 2 };

export default function Dashboard() {
  const [patients,   setPatients]   = useState([]);
  const [connected,  setConnected]  = useState(false);
  const [lastTick,   setLastTick]   = useState(null);
  const [filterWard, setFilterWard] = useState("ALL");
  const [filterSev,  setFilterSev]  = useState("ALL");

  useEffect(() => {
    fetch("http://localhost:3000/api/vitals/snapshot")
      .then(r => r.json())
      .then(data => setPatients(data.sort((a, b) => SORT_ORDER[a.severity] - SORT_ORDER[b.severity])))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const es = new EventSource("http://localhost:3000/api/vitals/stream");
    es.onopen    = () => setConnected(true);
    es.onmessage = (e) => {
      const incoming = JSON.parse(e.data);
      setLastTick(new Date());
      setPatients(prev => {
        const map = {};
        prev.forEach(p    => { map[p.mrn] = p; });
        incoming.forEach(p => { map[p.mrn] = p; });
        return Object.values(map).sort((a, b) => SORT_ORDER[a.severity] - SORT_ORDER[b.severity]);
      });
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  const wards     = ["ALL", ...new Set(patients.map(p => p.ward))];
  const displayed = patients.filter(p => {
    if (filterWard !== "ALL" && p.ward !== filterWard)    return false;
    if (filterSev  !== "ALL" && p.severity !== filterSev) return false;
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800&family=Roboto+Mono:wght@400;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink {
          0%, 100% { opacity: 1;   }
          50%       { opacity: 0.2; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        button { font-family: inherit; }
        ::-webkit-scrollbar       { width: 5px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.borderHard}; border-radius: 3px; }
      `}</style>

      {/* ── Navigation bar ── */}
      <nav style={{
        height: 62,
        background: C.navy,
        borderBottom: `3px solid ${C.accent}`,
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 16px rgba(13,31,60,0.18)",
      }}>
        {/* Logo area */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: C.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "#fff",
          }}>
            +
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.01em" }}>
              VitalWatch
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", fontWeight: 600 }}>
              PATIENT MONITORING SYSTEM
            </div>
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </div>
            {lastTick && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                Last sync: {lastTick.toLocaleTimeString()}
              </div>
            )}
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "6px 14px", borderRadius: 6,
            background: connected ? "rgba(14,124,110,0.25)" : "rgba(192,57,43,0.25)",
            border: `1px solid ${connected ? "rgba(14,124,110,0.5)" : "rgba(192,57,43,0.5)"}`,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: connected ? "#4DB6AC" : C.red,
              animation: connected ? "blink 2s ease-in-out infinite" : "none",
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              color: connected ? "#4DB6AC" : "#E88080",
            }}>
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "28px 32px 60px" }}>

        {/* Page heading */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, letterSpacing: "-0.02em" }}>
            Patient Overview
          </h1>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 5, fontWeight: 500 }}>
            Real-time vitals monitoring · Refreshed every 5 s · Critical patients shown first
          </p>
        </div>

        {/* Stats */}
        {patients.length > 0 && <StatsRow patients={patients} />}

        {/* Filter bar */}
        <div style={{
          padding: "12px 16px",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          display: "flex", alignItems: "center", gap: 8,
          flexWrap: "wrap",
          marginBottom: 22,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", marginRight: 2 }}>
            SEVERITY
          </span>

          {["ALL","RED","YELLOW","GREEN"].map(sev => {
            const active = filterSev === sev;
            const sc     = SEV[sev];
            return (
              <button key={sev} onClick={() => setFilterSev(sev)} style={{
                padding: "5px 14px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                cursor: "pointer", letterSpacing: "0.05em",
                border: `1px solid ${active ? (sc ? sc.border : C.borderHard) : C.border}`,
                background: active ? (sc ? sc.light : C.surfaceAlt) : "transparent",
                color: active ? (sc ? sc.color : C.navy) : C.muted,
                transition: "all 0.15s",
              }}>
                {sev === "ALL" ? "All" : sc.label}
              </button>
            );
          })}

          <div style={{ width: 1, height: 20, background: C.borderHard, margin: "0 4px" }} />

          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", marginRight: 2 }}>
            WARD
          </span>

          {wards.map(w => {
            const active = filterWard === w;
            return (
              <button key={w} onClick={() => setFilterWard(w)} style={{
                padding: "5px 14px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                cursor: "pointer", letterSpacing: "0.05em",
                border: `1px solid ${active ? C.accentBorder : C.border}`,
                background: active ? C.accentBg : "transparent",
                color: active ? C.accent : C.muted,
                transition: "all 0.15s",
              }}>
                {w}
              </button>
            );
          })}

          <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted, fontWeight: 600 }}>
            {displayed.length} patient{displayed.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Grid */}
        {displayed.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "80px 20px",
            background: C.surface, border: `1px dashed ${C.borderHard}`,
            borderRadius: 12, color: C.muted,
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.steel }}>No patients match the current filter</div>
            <div style={{ fontSize: 12, marginTop: 6, color: C.muted }}>Try adjusting the severity or ward filter above.</div>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(460px, 1fr))",
            gap: 16,
          }}>
            {displayed.map((p, i) => (
              <PatientCard key={p.mrn} patient={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}