import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL;

const socket = io(API_URL);

const emptyForm = {
  uid: "",
  name: "",
  admissionNo: "",
  rollNo: "",
  className: "",
  section: "",
  guardianName: "",
  guardianPhone: "",
  email: "",
  dateOfBirth: "",
  address: "",
};

function App() {
  const [activePage, setActivePage] = useState("dashboard");

  const [students, setStudents] = useState([]);

  const [attendance, setAttendance] = useState([]);

  const [studentStatus, setStudentStatus] = useState([]);

  const [latestScan, setLatestScan] = useState(null);

  const [unknownCard, setUnknownCard] = useState(null);

  const [blockedCard, setBlockedCard] = useState(null);

  const [connected, setConnected] = useState(false);

  const [search, setSearch] = useState("");

  const [classFilter, setClassFilter] = useState("ALL");

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [modalOpen, setModalOpen] = useState(false);

  const [editingStudent, setEditingStudent] = useState(null);

  const [form, setForm] = useState(emptyForm);

  const [saving, setSaving] = useState(false);

  // const [scanningCard, setScanningCard] = useState(false);

  const [scanningCard, setScanningCard] = useState(false);

  const [cardScanMessage, setCardScanMessage] = useState("");

  const scanningCardRef = useRef(false);

  /* =====================================================
     SOCKET
  ===================================================== */

  useEffect(() => {
    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("students-update", (data) => {
      setStudents(data);
    });

    socket.on("attendance-history", (data) => {
      setAttendance(data);
    });

    socket.on("student-status-update", (data) => {
      setStudentStatus(data);
    });

    socket.on("attendance-update", (data) => {
      playBeep("success");

      setLatestScan(data.record);

      setAttendance((prev) => [...prev, data.record]);

      setStudentStatus((prev) =>
        prev.map((student) =>
          student.id === data.studentStatus.studentId
            ? {
                ...student,
                ...data.studentStatus,
              }
            : student,
        ),
      );
    });

    socket.on("unknown-card", (data) => {
      playBeep("warning");

      setUnknownCard(data);
      setBlockedCard(null);
    });

    // NEW
    // socket.on("card-scanned", (data) => {
    //   console.log("Card scanned:", data);

    //   if (!scanningCard) {
    //     return;
    //   }

    //   setForm((previous) => ({
    //     ...previous,
    //     uid: data.uid,
    //   }));

    //   setScanningCard(false);
    //   setCardJustScanned(true);

    //   setTimeout(() => {
    //     setCardJustScanned(false);
    //   }, 2500);
    // });

    socket.on("card-scanned", (data) => {
      console.log("Card scanned for registration:", data);

      // Ignore normal attendance scans.
      if (!scanningCardRef.current) {
        return;
      }

      // Put UID into the currently open student form.
      setForm((previous) => ({
        ...previous,
        uid: data.uid,
      }));

      scanningCardRef.current = false;

      setScanningCard(false);

      setCardScanMessage(`Card detected: ${data.uid}`);
    });

    socket.on("unknown-card", (data) => {
      setUnknownCard(data);
      setBlockedCard(null);
    });

    socket.on("blocked-card", (data) => {
      setBlockedCard(data);
      setUnknownCard(null);
    });

    return () => {
      return () => {
        socket.off("connect");
        socket.off("disconnect");
        socket.off("students-update");
        socket.off("attendance-history");
        socket.off("student-status-update");
        socket.off("attendance-update");
        socket.off("unknown-card");
        socket.off("blocked-card");
        socket.off("card-scanned");
      };
    };
  }, []);

  /* =====================================================
     COUNTS
  ===================================================== */

  const totalStudents = students.length;

  const insideCount = studentStatus.filter(
    (student) => student.status === "INSIDE",
  ).length;

  const leftCount = studentStatus.filter(
    (student) => student.status === "LEFT_SCHOOL",
  ).length;

  const notArrivedCount = totalStudents - insideCount - leftCount;

  /* =====================================================
     CLASSES
  ===================================================== */

  const classes = useMemo(() => {
    return [
      ...new Set(students.map((student) => student.className).filter(Boolean)),
    ];
  }, [students]);

  /* =====================================================
     FILTER STUDENTS
  ===================================================== */

  const filteredStudents = students.filter((student) => {
    const liveStatus = studentStatus.find((item) => item.id === student.id);

    const status = liveStatus?.status || "NOT_ARRIVED";

    const searchMatch =
      student.name.toLowerCase().includes(search.toLowerCase()) ||
      student.admissionNo.toLowerCase().includes(search.toLowerCase()) ||
      (student.uid || "").toLowerCase().includes(search.toLowerCase());

    const classMatch =
      classFilter === "ALL" || student.className === classFilter;

    const statusMatch = statusFilter === "ALL" || status === statusFilter;

    return searchMatch && classMatch && statusMatch;
  });

  /* =====================================================
     FORM
  ===================================================== */

  function updateForm(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function openAddStudent(prefilledUid = "") {
    scanningCardRef.current = false;

    setScanningCard(false);

    setCardScanMessage("");

    setEditingStudent(null);

    setForm({
      ...emptyForm,
      uid: prefilledUid,
    });

    setModalOpen(true);
  }

  function startCardScan() {
    scanningCardRef.current = true;

    setScanningCard(true);

    setCardScanMessage("Waiting for card... Tap the NFC card on the reader.");
  }

  function openEditStudent(student) {
    scanningCardRef.current = false;

    setScanningCard(false);

    setCardScanMessage("");

    setEditingStudent(student);

    setForm({
      uid: student.uid || "",
      name: student.name || "",
      admissionNo: student.admissionNo || "",
      rollNo: student.rollNo || "",
      className: student.className || "",
      section: student.section || "",
      guardianName: student.guardianName || "",
      guardianPhone: student.guardianPhone || "",
      email: student.email || "",
      dateOfBirth: student.dateOfBirth || "",
      address: student.address || "",
    });

    setModalOpen(true);
  }

  async function saveStudent(event) {
    event.preventDefault();

    setSaving(true);

    try {
      const url = editingStudent
        ? `${API_URL}/api/students/${editingStudent.id}`
        : `${API_URL}/api/students`;

      const method = editingStudent ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Something went wrong.");
      }

      setModalOpen(false);

      setForm(emptyForm);

      setEditingStudent(null);
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  /* =====================================================
     DELETE STUDENT
  ===================================================== */

  async function deleteStudent(student) {
    const confirmed = window.confirm(
      `Delete ${student.name}? This will also remove their NFC card assignment.`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/api/students/${student.id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to delete student.");
      }
    } catch (error) {
      alert(error.message);
    }
  }

  /* =====================================================
     CARD STATUS
  ===================================================== */

  async function toggleCard(student) {
    try {
      await fetch(`${API_URL}/api/students/${student.id}/card-status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          active: !student.cardActive,
        }),
      });
    } catch (error) {
      alert("Could not change card status.");
    }
  }

  async function removeCard(student) {
    const confirmed = window.confirm(
      `Remove NFC card ${student.uid} from ${student.name}?`,
    );

    if (!confirmed) return;

    try {
      await fetch(`${API_URL}/api/students/${student.id}/card`, {
        method: "DELETE",
      });
    } catch (error) {
      alert("Could not remove card.");
    }
  }

  /* =====================================================
     RESET FILTERS
  ===================================================== */

  function resetFilters() {
    setSearch("");
    setClassFilter("ALL");
    setStatusFilter("ALL");
  }

  function playBeep(type = "success") {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    const audioContext = new AudioContext();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.type = "sine";

    if (type === "success") {
      oscillator.frequency.value = 850;
    } else if (type === "warning") {
      oscillator.frequency.value = 450;
    }

    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);

    gain.gain.exponentialRampToValueAtTime(
      0.18,
      audioContext.currentTime + 0.01,
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.18,
    );

    oscillator.start();

    oscillator.stop(audioContext.currentTime + 0.2);
  }

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E</div>

          <div>
            <strong>EduSmart</strong>

            <span>School Control Center</span>
          </div>
        </div>

        <div className="school-switch">
          <div className="school-avatar">B</div>

          <div>
            <strong>Bhoomija Modern Public School</strong>

            <span>Main Campus</span>
          </div>

          <span className="chevron">›</span>
        </div>

        <nav className="nav">
          <button
            className={
              activePage === "dashboard" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("dashboard")}
          >
            <span>⌂</span>
            Dashboard
          </button>

          <button
            className={
              activePage === "scanner" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("scanner")}
          >
            <span>⌁</span>
            Live Scanner
            {connected && <i className="nav-dot" />}
          </button>

          <button
            className={
              activePage === "students" ? "nav-item active" : "nav-item"
            }
            onClick={() => setActivePage("students")}
          >
            <span>▦</span>
            Students & Cards
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className={connected ? "pulse online" : "pulse"} />

            <div>
              <strong>{connected ? "System online" : "Offline"}</strong>

              <span>NFC reader connection</span>
            </div>
          </div>

          <div className="version">Prototype • v0.1</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              School Management
              <span>/</span>
              {activePage === "dashboard" && "Overview"}
              {activePage === "scanner" && "Live Scanner"}
              {activePage === "students" && "Students & Cards"}
            </div>

            <h1>
              {activePage === "dashboard" && "Good morning, Admin."}

              {activePage === "scanner" && "Live NFC Scanner"}

              {activePage === "students" && "Students & Cards"}
            </h1>
          </div>

          <div className="top-actions">
            <div
              className={
                connected ? "connection-pill connected" : "connection-pill"
              }
            >
              <span />
              {connected ? "Reader system online" : "Backend offline"}
            </div>

            {activePage === "students" && (
              <button className="primary-btn" onClick={() => openAddStudent()}>
                <b>+</b>
                Add Student
              </button>
            )}
          </div>
        </header>

        {/* ==================================================
            DASHBOARD
        ================================================== */}

        {activePage === "dashboard" && (
          <Dashboard
            totalStudents={totalStudents}
            insideCount={insideCount}
            leftCount={leftCount}
            notArrivedCount={notArrivedCount}
            latestScan={latestScan}
            students={studentStatus}
            onScanner={() => setActivePage("scanner")}
          />
        )}

        {/* ==================================================
            SCANNER
        ================================================== */}

        {activePage === "scanner" && (
          <ScannerPage
            connected={connected}
            latestScan={latestScan}
            unknownCard={unknownCard}
            blockedCard={blockedCard}
            onRegister={(uid) => {
              setUnknownCard(null);
              setActivePage("students");
              openAddStudent(uid);
            }}
          />
        )}

        {/* ==================================================
            STUDENTS
        ================================================== */}

        {activePage === "students" && (
          <StudentsPage
            students={filteredStudents}
            totalStudents={totalStudents}
            search={search}
            setSearch={setSearch}
            classFilter={classFilter}
            setClassFilter={setClassFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            classes={classes}
            resetFilters={resetFilters}
            onEdit={openEditStudent}
            onDelete={deleteStudent}
            onToggleCard={toggleCard}
            onRemoveCard={removeCard}
            onAdd={() => openAddStudent()}
          />
        )}

        {/* ==================================================
            MODAL
        ================================================== */}

        {modalOpen && (
          <StudentModal
            form={form}
            updateForm={updateForm}
            editingStudent={editingStudent}
            saving={saving}
            scanningCard={scanningCard}
            cardScanMessage={cardScanMessage}
            onScanCard={startCardScan}
            onClose={() => {
              setModalOpen(false);
              setEditingStudent(null);
            }}
            onSubmit={saveStudent}
          />
        )}
      </main>
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({
  totalStudents,
  insideCount,
  leftCount,
  notArrivedCount,
  latestScan,
  students,
  onScanner,
}) {
  return (
    <div className="page-content">
      <section className="hero-panel">
        <div>
          <div className="hero-eyebrow">LIVE SCHOOL STATUS</div>

          <h2>
            Everything is quiet.
            <br />
            Here's today's picture.
          </h2>

          <p>
            Attendance is being captured automatically through the NFC gate
            reader.
          </p>
        </div>

        <div className="hero-orbit">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-core">
            <span>{insideCount}</span>
            <small>inside</small>
          </div>
          <i className="orbit-dot dot-one" />
          <i className="orbit-dot dot-two" />
          <i className="orbit-dot dot-three" />
        </div>
      </section>

      <section className="metrics-grid">
        <Metric
          label="Registered"
          value={totalStudents}
          note="Student profiles"
          symbol="01"
        />

        <Metric
          label="Inside school"
          value={insideCount}
          note="Currently present"
          symbol="02"
          accent
        />

        <Metric
          label="Not arrived"
          value={notArrivedCount}
          note="No entry scan yet"
          symbol="03"
        />

        <Metric
          label="Left school"
          value={leftCount}
          note="Exited today"
          symbol="04"
        />
      </section>

      <section className="dashboard-grid">
        <div className="panel large">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">LIVE</span>

              <h3>Student presence</h3>
            </div>

            <button className="ghost-btn" onClick={onScanner}>
              Open scanner →
            </button>
          </div>

          <div className="mini-presence">
            {students.slice(0, 6).map((student) => (
              <div className="presence-row" key={student.id}>
                <div className="mini-avatar">
                  {student.name.charAt(0).toUpperCase()}
                </div>

                <div className="presence-name">
                  <strong>{student.name}</strong>

                  <span>
                    {student.className}-{student.section}
                  </span>
                </div>

                <StatusBadge status={student.status} />

                <span className="row-time">{student.entryTime || "—"}</span>
              </div>
            ))}

            {students.length === 0 && (
              <EmptyState text="No students registered yet." />
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">LATEST EVENT</span>

              <h3>Gate activity</h3>
            </div>
          </div>

          {latestScan ? (
            <div className="latest-event">
              <div
                className={
                  latestScan.type === "ENTRY"
                    ? "event-icon entry"
                    : "event-icon exit"
                }
              >
                {latestScan.type === "ENTRY" ? "IN" : "OUT"}
              </div>

              <div>
                <strong>{latestScan.name}</strong>

                <span>
                  {latestScan.type === "ENTRY"
                    ? "Entered school"
                    : "Left school"}
                </span>

                <small>{latestScan.time}</small>
              </div>
            </div>
          ) : (
            <EmptyState text="Waiting for the first scan." />
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, note, symbol, accent }) {
  return (
    <div className={accent ? "metric accent" : "metric"}>
      <div className="metric-top">
        <span>{symbol}</span>

        <small>{label}</small>
      </div>

      <strong>{value}</strong>

      <p>{note}</p>
    </div>
  );
}

/* =========================================================
   SCANNER
========================================================= */

function ScannerPage({
  connected,
  latestScan,
  unknownCard,
  blockedCard,
  onRegister,
}) {
  return (
    <div className="page-content">
      <div className="scanner-layout">
        <section className="scanner-main">
          <div className="scanner-status">
            <span className={connected ? "live-dot active" : "live-dot"} />

            {connected
              ? "Listening for NFC scans"
              : "Backend connection unavailable"}
          </div>

          <div className="scanner-visual">
            <div className="scan-ring ring-a" />
            <div className="scan-ring ring-b" />
            <div className="scan-ring ring-c" />

            <div className="scan-card">
              <span>NFC</span>
              <strong>Tap card</strong>

              <div className="scan-lines">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>

          <div className="scanner-copy">
            <span className="eyebrow">MAIN GATE</span>

            <h2>Ready for the next student.</h2>

            <p>
              Tap a registered NFC card on the PN532 reader. The student's
              identity and current attendance state will appear here instantly.
            </p>
          </div>
        </section>

        <section className="scanner-side">
          <div className="side-card">
            <div className="side-heading">
              <span>Latest scan</span>

              <span className="live-chip">LIVE</span>
            </div>

            {latestScan ? (
              <>
                <div className="scan-result-icon">
                  {latestScan.type === "ENTRY" ? "✓" : "↗"}
                </div>

                <h3>{latestScan.name}</h3>

                <p>
                  {latestScan.className}-{latestScan.section}
                  {" · "}
                  Roll {latestScan.rollNo}
                </p>

                <div className="result-grid">
                  <div>
                    <span>Event</span>
                    <strong>{latestScan.type}</strong>
                  </div>

                  <div>
                    <span>Time</span>
                    <strong>{latestScan.time}</strong>
                  </div>

                  <div className="full">
                    <span>Card UID</span>
                    <strong>{latestScan.uid}</strong>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState text="No card scanned yet." />
            )}
          </div>

          {unknownCard && (
            <div className="alert-card unknown">
              <div>
                <span className="alert-kicker">UNREGISTERED CARD</span>

                <h3>New card detected</h3>

                <p>{unknownCard.uid}</p>
              </div>

              <button
                className="alert-action"
                onClick={() => onRegister(unknownCard.uid)}
              >
                Register card →
              </button>
            </div>
          )}

          {blockedCard && (
            <div className="alert-card blocked">
              <div>
                <span className="alert-kicker">CARD DISABLED</span>

                <h3>{blockedCard.student.name}</h3>

                <p>{blockedCard.uid}</p>
              </div>
            </div>
          )}

          <div className="how-card">
            <span className="eyebrow">WORKFLOW</span>

            <div className="workflow">
              <Step number="01" text="Tap card" />

              <Step number="02" text="Identify student" />

              <Step number="03" text="Record event" />

              <Step number="04" text="Update dashboard" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Step({ number, text }) {
  return (
    <div className="step">
      <span>{number}</span>
      <strong>{text}</strong>
    </div>
  );
}

/* =========================================================
   STUDENTS
========================================================= */

function StudentsPage({
  students,
  totalStudents,
  search,
  setSearch,
  classFilter,
  setClassFilter,
  statusFilter,
  setStatusFilter,
  classes,
  resetFilters,
  onEdit,
  onDelete,
  onToggleCard,
  onRemoveCard,
  onAdd,
}) {
  return (
    <div className="page-content">
      <section className="student-hero">
        <div>
          <span className="eyebrow">REGISTRY</span>

          <h2>Students & NFC cards</h2>

          <p>
            One place to manage every student, identity record and card assigned
            to them.
          </p>
        </div>

        <div className="registry-stat">
          <strong>{totalStudents}</strong>

          <span>student profiles</span>
        </div>
      </section>

      <section className="toolbar">
        <div className="search-box">
          <span>⌕</span>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, admission no. or card UID..."
          />
        </div>

        <select
          value={classFilter}
          onChange={(event) => setClassFilter(event.target.value)}
        >
          <option value="ALL">All classes</option>

          {classes.map((item) => (
            <option value={item} key={item}>
              Class {item}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="ALL">All status</option>

          <option value="INSIDE">Inside</option>

          <option value="NOT_ARRIVED">Not arrived</option>

          <option value="LEFT_SCHOOL">Left school</option>
        </select>

        <button className="ghost-btn" onClick={resetFilters}>
          Reset
        </button>
      </section>

      <section className="student-list-panel">
        <div className="table-head">
          <span>{students.length} results</span>

          <button className="primary-btn small" onClick={onAdd}>
            + Add student
          </button>
        </div>

        <div className="student-table">
          <div className="table-row table-header">
            <span>Student</span>
            <span>Class</span>
            <span>NFC Card</span>
            <span>Status</span>
            <span>Card state</span>
            <span />
          </div>

          {students.map((student) => (
            <StudentRow
              key={student.id}
              student={student}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleCard={onToggleCard}
              onRemoveCard={onRemoveCard}
            />
          ))}

          {students.length === 0 && (
            <EmptyState text="No students match your filters." />
          )}
        </div>
      </section>
    </div>
  );
}

function StudentRow({ student, onEdit, onDelete, onToggleCard, onRemoveCard }) {
  const status = student.status || "NOT_ARRIVED";

  return (
    <div className="table-row">
      <div className="student-cell">
        <div className="student-avatar">
          {student.name.charAt(0).toUpperCase()}
        </div>

        <div>
          <strong>{student.name}</strong>

          <small>
            {student.admissionNo}
            {" · "}
            Roll {student.rollNo}
          </small>
        </div>
      </div>

      <div className="muted-cell">
        {student.className}
        {"-"}
        {student.section}
      </div>

      <div>
        {student.uid ? (
          <div className="uid-cell">
            <span className="card-dot" />

            <code>{student.uid}</code>
          </div>
        ) : (
          <span className="unassigned">No card</span>
        )}
      </div>

      <div>
        <StatusBadge status={status} />
      </div>

      <div>
        {student.uid ? (
          <button
            className={
              student.cardActive ? "card-state active" : "card-state disabled"
            }
            onClick={() => onToggleCard(student)}
          >
            {student.cardActive ? "Active" : "Disabled"}
          </button>
        ) : (
          <span className="unassigned">Unassigned</span>
        )}
      </div>

      <div className="row-actions">
        <button
          className="icon-btn"
          title="Edit student"
          onClick={() => onEdit(student)}
        >
          Edit
        </button>

        {student.uid && (
          <button
            className="icon-btn"
            title="Remove card"
            onClick={() => onRemoveCard(student)}
          >
            Card
          </button>
        )}

        <button
          className="icon-btn danger"
          title="Delete student"
          onClick={() => onDelete(student)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   MODAL
========================================================= */

function StudentModal({
  form,
  updateForm,
  editingStudent,
  saving,
  scanningCard,
  cardScanMessage,
  onScanCard,
  onClose,
  onSubmit,
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">
              {editingStudent ? "EDIT PROFILE" : "NEW PROFILE"}
            </span>

            <h2>{editingStudent ? "Update student" : "Add student"}</h2>

            <p>Student identity and NFC card information.</p>
          </div>

          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="student-form">
          <div className="form-section">
            <div className="form-section-title">Basic information</div>

            <div className="form-grid">
              <Field
                label="Student name *"
                value={form.name}
                onChange={(value) => updateForm("name", value)}
              />

              <Field
                label="Admission number *"
                value={form.admissionNo}
                onChange={(value) => updateForm("admissionNo", value)}
              />

              <Field
                label="Class *"
                value={form.className}
                onChange={(value) => updateForm("className", value)}
                placeholder="10"
              />

              <Field
                label="Section"
                value={form.section}
                onChange={(value) => updateForm("section", value)}
                placeholder="A"
              />

              <Field
                label="Roll number"
                value={form.rollNo}
                onChange={(value) => updateForm("rollNo", value)}
              />

              <Field
                label="Date of birth"
                type="date"
                value={form.dateOfBirth}
                onChange={(value) => updateForm("dateOfBirth", value)}
              />
            </div>
          </div>

          <div className="form-section card-form-section">
            <div className="form-section-title">NFC identity</div>

            <div className="nfc-assignment">
              <div className={`nfc-uid-box ${form.uid ? "has-card" : ""}`}>
                <div className="nfc-symbol">⌁</div>

                <div className="nfc-uid-content">
                  <span className="nfc-label">Assigned card</span>

                  <strong>{form.uid || "No NFC card assigned"}</strong>
                </div>

                {form.uid && <div className="nfc-confirmed">✓ Assigned</div>}
              </div>

              <button
                type="button"
                className={`scan-card-btn ${scanningCard ? "scanning" : ""}`}
                onClick={onScanCard}
                disabled={scanningCard}
              >
                <span className="scan-button-icon">
                  {scanningCard ? "◌" : "⌁"}
                </span>

                {scanningCard
                  ? "Waiting for card..."
                  : form.uid
                    ? "Scan different card"
                    : "Scan NFC Card"}
              </button>
            </div>

            {scanningCard && (
              <div className="scan-live-message">
                <span className="scan-live-dot" />

                {cardScanMessage}
              </div>
            )}

            {!scanningCard && cardScanMessage && (
              <div className="scan-success-message">✓ {cardScanMessage}</div>
            )}

            <p className="field-note">
              Tap the student's NFC card on the connected reader to assign it
              automatically.
            </p>
          </div>

          <div className="form-section">
            <div className="form-section-title">Parent / guardian</div>

            <div className="form-grid">
              <Field
                label="Guardian name"
                value={form.guardianName}
                onChange={(value) => updateForm("guardianName", value)}
              />

              <Field
                label="Guardian phone"
                value={form.guardianPhone}
                onChange={(value) => updateForm("guardianPhone", value)}
              />

              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) => updateForm("email", value)}
              />

              <Field
                label="Address"
                value={form.address}
                onChange={(value) => updateForm("address", value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="ghost-btn" onClick={onClose}>
              Cancel
            </button>

            <button type="submit" className="primary-btn" disabled={saving}>
              {saving
                ? "Saving..."
                : editingStudent
                  ? "Save changes"
                  : "Create student"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function StatusBadge({ status }) {
  const config = {
    INSIDE: {
      label: "Inside",
      className: "inside",
    },

    LEFT_SCHOOL: {
      label: "Left school",
      className: "left",
    },

    NOT_ARRIVED: {
      label: "Not arrived",
      className: "not-arrived",
    },
  };

  const item = config[status] || config.NOT_ARRIVED;

  return (
    <span className={`status-badge ${item.className}`}>
      <i />
      {item.label}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <div>—</div>
      <p>{text}</p>
    </div>
  );
}

export default App;
