// FILE: src/features/patient/JointAssessmentSheet.tsx
// Sports & Athletic Joint Assessment — printable A4 sheet

import React, { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { Printer, Save, ChevronDown, ChevronUp } from "lucide-react";

// ─── Joint Configuration ──────────────────────────────────────────────────────

interface MotionDef { id: string; label: string; normal: string; }
interface MuscleDef { id: string; label: string; }
interface TestDef   { id: string; label: string; }

interface JointDef {
  label:         string;
  bilateral:     boolean;   // has left/right variants
  motions:       MotionDef[];
  muscles:       MuscleDef[];
  specialTests:  TestDef[];
}

const JOINTS: Record<string, JointDef> = {
  cervical: {
    label: "Cervical Spine", bilateral: false,
    motions: [
      { id: "flex",  label: "Flexion",            normal: "0–45°" },
      { id: "ext",   label: "Extension",           normal: "0–45°" },
      { id: "lf_l",  label: "Lat. Flexion (L)",    normal: "0–45°" },
      { id: "lf_r",  label: "Lat. Flexion (R)",    normal: "0–45°" },
      { id: "rot_l", label: "Rotation (L)",         normal: "0–60°" },
      { id: "rot_r", label: "Rotation (R)",         normal: "0–60°" },
    ],
    muscles: [
      { id: "scm",             label: "SCM / Scalenes"    },
      { id: "upper_trap",      label: "Upper Trapezius"   },
      { id: "deep_neck_flex",  label: "Deep Neck Flexors" },
      { id: "neck_ext",        label: "Neck Extensors"    },
    ],
    specialTests: [
      { id: "spurling",    label: "Spurling's Test"        },
      { id: "distraction", label: "Cervical Distraction"   },
      { id: "valsalva",    label: "Valsalva Test"          },
      { id: "ultt_med",    label: "ULTT – Median N."       },
      { id: "ultt_rad",    label: "ULTT – Radial N."       },
      { id: "ultt_uln",    label: "ULTT – Ulnar N."        },
    ],
  },
  thoracic: {
    label: "Thoracic Spine", bilateral: false,
    motions: [
      { id: "flex",  label: "Flexion",           normal: "0–45°" },
      { id: "ext",   label: "Extension",          normal: "0–25°" },
      { id: "lf_l",  label: "Lat. Flexion (L)",   normal: "0–25°" },
      { id: "lf_r",  label: "Lat. Flexion (R)",   normal: "0–25°" },
      { id: "rot_l", label: "Rotation (L)",        normal: "0–35°" },
      { id: "rot_r", label: "Rotation (R)",        normal: "0–35°" },
    ],
    muscles: [
      { id: "erectors",  label: "Thoracic Erectors" },
      { id: "rhomboids", label: "Rhomboids"          },
      { id: "mid_trap",  label: "Mid Trapezius"      },
      { id: "serratus",  label: "Serratus Anterior"  },
    ],
    specialTests: [
      { id: "rib_spring",   label: "Rib Spring Test"         },
      { id: "thoracic_ext", label: "Thoracic Extension Test" },
      { id: "first_rib",    label: "First Rib Mobility"      },
    ],
  },
  lumbar: {
    label: "Lumbar Spine", bilateral: false,
    motions: [
      { id: "flex",  label: "Flexion",           normal: "0–60°" },
      { id: "ext",   label: "Extension",          normal: "0–25°" },
      { id: "lf_l",  label: "Lat. Flexion (L)",   normal: "0–25°" },
      { id: "lf_r",  label: "Lat. Flexion (R)",   normal: "0–25°" },
      { id: "rot_l", label: "Rotation (L)",        normal: "0–30°" },
      { id: "rot_r", label: "Rotation (R)",        normal: "0–30°" },
    ],
    muscles: [
      { id: "erectors",  label: "Erector Spinae"          },
      { id: "multifidus",label: "Multifidus"               },
      { id: "ta",        label: "Transversus Abdominis"    },
      { id: "ra",        label: "Rectus Abdominis"         },
      { id: "obliques",  label: "Obliques"                 },
      { id: "iliopsoas", label: "Iliopsoas"                },
    ],
    specialTests: [
      { id: "slr",          label: "Straight Leg Raise (SLR)"     },
      { id: "crossed_slr",  label: "Crossed SLR"                  },
      { id: "slump",        label: "Slump Test"                    },
      { id: "prone_kb",     label: "Prone Knee Bend (Femoral)"     },
      { id: "kemp",         label: "Kemp's Test"                   },
      { id: "spring",       label: "Spring Test"                   },
      { id: "si_faber",     label: "FABER (SI)"                    },
      { id: "si_compress",  label: "Sacral Compression"            },
    ],
  },
  shoulder: {
    label: "Shoulder", bilateral: true,
    motions: [
      { id: "flex",  label: "Flexion",            normal: "0–180°" },
      { id: "ext",   label: "Extension",           normal: "0–60°"  },
      { id: "abd",   label: "Abduction",           normal: "0–180°" },
      { id: "add",   label: "Adduction",           normal: "0–45°"  },
      { id: "ir",    label: "Internal Rotation",   normal: "0–70°"  },
      { id: "er",    label: "External Rotation",   normal: "0–90°"  },
      { id: "habd",  label: "Horiz. Abduction",    normal: "0–90°"  },
      { id: "hadd",  label: "Horiz. Adduction",    normal: "0–45°"  },
    ],
    muscles: [
      { id: "delt_ant",  label: "Deltoid (Ant.)"       },
      { id: "delt_mid",  label: "Deltoid (Mid.)"       },
      { id: "delt_post", label: "Deltoid (Post.)"      },
      { id: "suprasp",   label: "Supraspinatus"        },
      { id: "infrasp",   label: "Infraspinatus"        },
      { id: "subscap",   label: "Subscapularis"        },
      { id: "tmin",      label: "Teres Minor"          },
      { id: "biceps",    label: "Biceps Brachii"       },
      { id: "pec_maj",   label: "Pectoralis Major"     },
      { id: "lat_dors",  label: "Latissimus Dorsi"     },
    ],
    specialTests: [
      { id: "neer",         label: "Neer's Test"           },
      { id: "hawkins",      label: "Hawkins-Kennedy"       },
      { id: "empty_can",    label: "Empty Can (Jobe)"      },
      { id: "obrien",       label: "O'Brien (SLAP)"        },
      { id: "apprehension", label: "Apprehension Test"     },
      { id: "relocation",   label: "Relocation Test"       },
      { id: "sulcus",       label: "Sulcus Sign"           },
      { id: "speeds",       label: "Speed's Test"          },
      { id: "drop_arm",     label: "Drop Arm Test"         },
      { id: "cross_body",   label: "Cross-Body Add. (AC)"  },
    ],
  },
  elbow: {
    label: "Elbow", bilateral: true,
    motions: [
      { id: "flex", label: "Flexion",    normal: "0–150°" },
      { id: "ext",  label: "Extension",  normal: "0° (hyperext possible)" },
      { id: "pron", label: "Pronation",  normal: "0–80°"  },
      { id: "sup",  label: "Supination", normal: "0–80°"  },
    ],
    muscles: [
      { id: "biceps",      label: "Biceps Brachii"    },
      { id: "brachialis",  label: "Brachialis"        },
      { id: "triceps",     label: "Triceps"           },
      { id: "pron_teres",  label: "Pronator Teres"    },
      { id: "supinator",   label: "Supinator"         },
      { id: "wrist_flex",  label: "Wrist Flexors"     },
      { id: "wrist_ext",   label: "Wrist Extensors"   },
    ],
    specialTests: [
      { id: "cozen",      label: "Cozen's Test (Lat. epicondylalgia)" },
      { id: "mills",      label: "Mill's Test"                        },
      { id: "maudsley",   label: "Maudsley's Test (Middle finger ext)" },
      { id: "med_epic",   label: "Medial Epicondyle Palpation"        },
      { id: "valgus",     label: "Valgus Stress (UCL)"                },
      { id: "varus",      label: "Varus Stress (LCL)"                 },
      { id: "elbow_flex", label: "Elbow Flexion Test (Cubital Tunnel)" },
    ],
  },
  wrist: {
    label: "Wrist & Hand", bilateral: true,
    motions: [
      { id: "flex",  label: "Wrist Flexion",     normal: "0–80°"  },
      { id: "ext",   label: "Wrist Extension",   normal: "0–70°"  },
      { id: "rad",   label: "Radial Deviation",  normal: "0–20°"  },
      { id: "uln",   label: "Ulnar Deviation",   normal: "0–30°"  },
      { id: "pron",  label: "Pronation",         normal: "0–80°"  },
      { id: "sup",   label: "Supination",        normal: "0–80°"  },
      { id: "grip",  label: "Grip Strength",     normal: "Dynamometer" },
    ],
    muscles: [
      { id: "fcr",        label: "FCR"               },
      { id: "fcu",        label: "FCU"               },
      { id: "ecrb",       label: "ECRB / ECRL"       },
      { id: "ecu",        label: "ECU"               },
      { id: "fds_fdp",    label: "FDS / FDP"         },
      { id: "intrinsics", label: "Intrinsics"        },
      { id: "thumb_opp",  label: "Thumb Opponents"   },
    ],
    specialTests: [
      { id: "finkelstein", label: "Finkelstein's (de Quervain)"  },
      { id: "phalen",      label: "Phalen's Test (CTS)"          },
      { id: "tinel",       label: "Tinel's at Wrist"             },
      { id: "watson",      label: "Watson Scaphoid Test"         },
      { id: "piano_keys",  label: "Piano Keys Test (DRUJ)"       },
    ],
  },
  hip: {
    label: "Hip", bilateral: true,
    motions: [
      { id: "flex", label: "Flexion",           normal: "0–120°" },
      { id: "ext",  label: "Extension",          normal: "0–30°"  },
      { id: "abd",  label: "Abduction",          normal: "0–45°"  },
      { id: "add",  label: "Adduction",          normal: "0–30°"  },
      { id: "ir",   label: "Internal Rotation",  normal: "0–45°"  },
      { id: "er",   label: "External Rotation",  normal: "0–45°"  },
    ],
    muscles: [
      { id: "iliopsoas",  label: "Iliopsoas"         },
      { id: "glut_max",   label: "Gluteus Maximus"   },
      { id: "glut_med",   label: "Gluteus Medius"    },
      { id: "glut_min",   label: "Gluteus Minimus"   },
      { id: "adductors",  label: "Adductors"         },
      { id: "piriformis", label: "Piriformis / ERs"  },
      { id: "hamstrings", label: "Hamstrings"        },
      { id: "quads",      label: "Quadriceps"        },
      { id: "tfl",        label: "TFL / IT Band"     },
    ],
    specialTests: [
      { id: "faber",         label: "FABER Test"             },
      { id: "fadir",         label: "FADIR Test"             },
      { id: "scouring",      label: "Hip Scouring"           },
      { id: "thomas",        label: "Thomas Test"            },
      { id: "ober",          label: "Ober's Test (ITB)"      },
      { id: "trendelenburg", label: "Trendelenburg Test"     },
      { id: "log_roll",      label: "Log Roll Test"          },
      { id: "hip_quad",      label: "Hip Quadrant Test"      },
    ],
  },
  knee: {
    label: "Knee", bilateral: true,
    motions: [
      { id: "flex", label: "Flexion",           normal: "0–135°" },
      { id: "ext",  label: "Extension",          normal: "0° (hyperext possible)" },
      { id: "ir",   label: "Internal Rotation",  normal: "0–10°" },
      { id: "er",   label: "External Rotation",  normal: "0–10°" },
    ],
    muscles: [
      { id: "quads",      label: "Quadriceps (VMO / VL)"  },
      { id: "ham_med",    label: "Medial Hamstrings"       },
      { id: "ham_lat",    label: "Lateral Hamstrings"      },
      { id: "gastroc",    label: "Gastrocnemius"           },
      { id: "popliteus",  label: "Popliteus"               },
    ],
    specialTests: [
      { id: "lachman",     label: "Lachman Test (ACL)"       },
      { id: "ant_drawer",  label: "Anterior Drawer (ACL)"    },
      { id: "post_drawer", label: "Posterior Drawer (PCL)"   },
      { id: "mcmurray",    label: "McMurray Test (Meniscus)" },
      { id: "thessaly",    label: "Thessaly Test (Meniscus)" },
      { id: "valgus",      label: "Valgus Stress (MCL)"      },
      { id: "varus",       label: "Varus Stress (LCL)"       },
      { id: "pivot_shift", label: "Pivot Shift Test"         },
      { id: "pat_grind",   label: "Patellar Grind Test"      },
      { id: "dial",        label: "Dial Test (PLC)"          },
    ],
  },
  ankle: {
    label: "Ankle & Foot", bilateral: true,
    motions: [
      { id: "df",      label: "Dorsiflexion",         normal: "0–20°" },
      { id: "pf",      label: "Plantarflexion",       normal: "0–50°" },
      { id: "inv",     label: "Inversion",            normal: "0–35°" },
      { id: "ev",      label: "Eversion",             normal: "0–15°" },
      { id: "sub_inv", label: "Subtalar Inversion",   normal: "0–20°" },
      { id: "sub_ev",  label: "Subtalar Eversion",    normal: "0–10°" },
      { id: "mtp_ext", label: "1st MTP Extension",   normal: "0–70°" },
    ],
    muscles: [
      { id: "tib_ant",  label: "Tibialis Anterior"   },
      { id: "tib_post", label: "Tibialis Posterior"  },
      { id: "gastroc",  label: "Gastrocnemius"       },
      { id: "soleus",   label: "Soleus"              },
      { id: "peroneals",label: "Peroneals (PL / PB)" },
      { id: "fhl_fdl",  label: "FHL / FDL"          },
      { id: "ehl_edl",  label: "EHL / EDL"          },
    ],
    specialTests: [
      { id: "ant_drawer",  label: "Anterior Drawer (ATFL)"      },
      { id: "talar_tilt",  label: "Talar Tilt (CFL)"            },
      { id: "thompson",    label: "Thompson Test (Achilles)"     },
      { id: "arc_sign",    label: "Arc Sign"                     },
      { id: "silfverskiold",label: "Silfverskiöld Test"          },
      { id: "slhr",        label: "Single Leg Heel Raise"        },
      { id: "windlass",    label: "Windlass Test (Plantar fascia)"},
      { id: "too_many",    label: "Too Many Toes Sign"           },
    ],
  },
};

const JOINT_ORDER = [
  "cervical","thoracic","lumbar",
  "shoulder","elbow","wrist",
  "hip","knee","ankle",
];

const OXFORD_GRADES = ["0","1","2","3","4","5"];
const TEST_RESULTS   = ["","positive","negative","unable"];
const END_FEELS      = ["","firm","soft","hard","empty","springy"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ROMEntry { active: string; passive: string; endFeel: string; pain: string; }
interface MuscleEntry { grade: string; force: string; }
interface TestEntry  { result: string; notes: string; }

interface JointData {
  pain:    string;
  swelling:string;
  notes:   string;
  rom:     Record<string, ROMEntry>;
  muscles: Record<string, MuscleEntry>;
  tests:   Record<string, TestEntry>;
}

interface AssessmentDoc {
  selectedJoints: string[];   // e.g. ["shoulder_l", "knee_r"]
  date:           string;
  assessor:       string;
  sport:          string;
  dominantSide:   string;
  mechanism:      string;
  impression:     string;
  joints:         Record<string, JointData>;
}

function emptyJoint(): JointData {
  return { pain: "", swelling: "", notes: "", rom: {}, muscles: {}, tests: {} };
}

function emptyDoc(): AssessmentDoc {
  return {
    selectedJoints: [],
    date:           new Date().toISOString().slice(0, 10),
    assessor:       "",
    sport:          "",
    dominantSide:   "right",
    mechanism:      "",
    impression:     "",
    joints:         {},
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  patientId:    string;
  patientName?: string;
  canEdit:      boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the joint+side keys to show in the selector, e.g. "shoulder_l", "shoulder_r", "cervical" */
function expandedJointKeys(): { key: string; label: string; jointId: string }[] {
  return JOINT_ORDER.flatMap((jid) => {
    const j = JOINTS[jid];
    if (j.bilateral) {
      return [
        { key: `${jid}_l`, label: `${j.label} (Left)`,  jointId: jid },
        { key: `${jid}_r`, label: `${j.label} (Right)`, jointId: jid },
      ];
    }
    return [{ key: jid, label: j.label, jointId: jid }];
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ROMTable({
  jointId, jointKey, data, canEdit, onChange,
}: {
  jointId: string; jointKey: string; data: JointData; canEdit: boolean;
  onChange: (jk: string, data: JointData) => void;
}) {
  const motions = JOINTS[jointId].motions;
  const set = (motId: string, field: keyof ROMEntry, val: string) => {
    const updated: JointData = {
      ...data,
      rom: {
        ...data.rom,
        [motId]: { active: "", passive: "", endFeel: "", pain: "", ...data.rom[motId], [field]: val },
      },
    };
    onChange(jointKey, updated);
  };

  return (
    <div className="jas-table-wrap">
      <table className="jas-table">
        <thead>
          <tr>
            <th className="jas-th-motion">Motion</th>
            <th className="jas-th-norm">Normal</th>
            <th className="jas-th-val">Active ROM</th>
            <th className="jas-th-val">Passive ROM</th>
            <th className="jas-th-ef">End Feel</th>
            <th className="jas-th-pain">Pain</th>
          </tr>
        </thead>
        <tbody>
          {motions.map((m) => {
            const r = data.rom[m.id] ?? { active: "", passive: "", endFeel: "", pain: "" };
            return (
              <tr key={m.id}>
                <td className="jas-td-motion">{m.label}</td>
                <td className="jas-td-norm">{m.normal}</td>
                <td>
                  {canEdit
                    ? <input className="jas-cell-input" value={r.active}   onChange={(e) => set(m.id, "active",   e.target.value)} placeholder="—" />
                    : <span className="jas-cell-val">{r.active   || "—"}</span>}
                </td>
                <td>
                  {canEdit
                    ? <input className="jas-cell-input" value={r.passive}  onChange={(e) => set(m.id, "passive",  e.target.value)} placeholder="—" />
                    : <span className="jas-cell-val">{r.passive  || "—"}</span>}
                </td>
                <td>
                  {canEdit
                    ? (
                      <select className="jas-cell-select" value={r.endFeel} onChange={(e) => set(m.id, "endFeel", e.target.value)}>
                        {END_FEELS.map((ef) => <option key={ef} value={ef}>{ef || "—"}</option>)}
                      </select>
                    )
                    : <span className="jas-cell-val">{r.endFeel || "—"}</span>}
                </td>
                <td className="jas-td-pain">
                  {canEdit
                    ? (
                      <select className="jas-cell-select-sm" value={r.pain} onChange={(e) => set(m.id, "pain", e.target.value)}>
                        <option value="">—</option>
                        <option value="+">+</option>
                        <option value="-">−</option>
                      </select>
                    )
                    : <span className={`jas-pain-badge ${r.pain === "+" ? "pos" : ""}`}>{r.pain || "—"}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MuscleTable({
  jointId, jointKey, data, canEdit, onChange,
}: {
  jointId: string; jointKey: string; data: JointData; canEdit: boolean;
  onChange: (jk: string, data: JointData) => void;
}) {
  const muscles = JOINTS[jointId].muscles;
  const set = (mid: string, field: keyof MuscleEntry, val: string) => {
    const updated: JointData = {
      ...data,
      muscles: {
        ...data.muscles,
        [mid]: { grade: "", force: "", ...data.muscles[mid], [field]: val },
      },
    };
    onChange(jointKey, updated);
  };

  const gradeColor = (g: string) => {
    const n = Number(g);
    if (!g) return "";
    if (n <= 1) return "jas-grade-red";
    if (n <= 3) return "jas-grade-orange";
    if (n === 4) return "jas-grade-yellow";
    return "jas-grade-green";
  };

  return (
    <div className="jas-table-wrap">
      <table className="jas-table">
        <thead>
          <tr>
            <th className="jas-th-muscle">Muscle / Group</th>
            <th className="jas-th-grade">Oxford Grade (0–5)</th>
            <th className="jas-th-force">Force (N/kg) <span className="jas-device-badge">Device</span></th>
          </tr>
        </thead>
        <tbody>
          {muscles.map((m) => {
            const mu = data.muscles[m.id] ?? { grade: "", force: "" };
            return (
              <tr key={m.id}>
                <td className="jas-td-muscle">{m.label}</td>
                <td>
                  {canEdit
                    ? (
                      <div className="jas-grade-btns">
                        {OXFORD_GRADES.map((g) => (
                          <button
                            key={g} type="button"
                            className={`jas-grade-btn ${mu.grade === g ? `active ${gradeColor(g)}` : ""}`}
                            onClick={() => set(m.id, "grade", mu.grade === g ? "" : g)}
                          >{g}</button>
                        ))}
                      </div>
                    )
                    : <span className={`jas-grade-chip ${gradeColor(mu.grade)}`}>{mu.grade || "—"}</span>}
                </td>
                <td>
                  {canEdit
                    ? <input className="jas-cell-input" value={mu.force} onChange={(e) => set(m.id, "force", e.target.value)} placeholder="pending device" />
                    : <span className="jas-cell-val">{mu.force || <span style={{ color: "#c0bbb4", fontStyle: "italic", fontSize: 12 }}>pending</span>}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SpecialTestsGrid({
  jointId, jointKey, data, canEdit, onChange,
}: {
  jointId: string; jointKey: string; data: JointData; canEdit: boolean;
  onChange: (jk: string, data: JointData) => void;
}) {
  const tests = JOINTS[jointId].specialTests;
  const set = (tid: string, field: keyof TestEntry, val: string) => {
    const updated: JointData = {
      ...data,
      tests: {
        ...data.tests,
        [tid]: { result: "", notes: "", ...data.tests[tid], [field]: val },
      },
    };
    onChange(jointKey, updated);
  };

  return (
    <div className="jas-tests-grid">
      {tests.map((t) => {
        const te = data.tests[t.id] ?? { result: "", notes: "" };
        const res = te.result;
        return (
          <div key={t.id} className={`jas-test-card ${res === "positive" ? "jas-test-pos" : res === "negative" ? "jas-test-neg" : ""}`}>
            <div className="jas-test-name">{t.label}</div>
            {canEdit
              ? (
                <div className="jas-test-controls">
                  <div className="jas-test-result-btns">
                    {(["positive","negative","unable"] as const).map((r) => (
                      <button key={r} type="button"
                        className={`jas-test-res-btn jas-test-res-${r} ${te.result === r ? "active" : ""}`}
                        onClick={() => set(t.id, "result", te.result === r ? "" : r)}
                      >{r === "positive" ? "+" : r === "negative" ? "−" : "N/A"}</button>
                    ))}
                  </div>
                  <input
                    className="jas-test-notes-input"
                    value={te.notes}
                    onChange={(e) => set(t.id, "notes", e.target.value)}
                    placeholder="Notes…"
                  />
                </div>
              )
              : (
                <div className="jas-test-result-read">
                  {res === "positive" && <span className="jas-res-chip jas-res-pos">Positive</span>}
                  {res === "negative" && <span className="jas-res-chip jas-res-neg">Negative</span>}
                  {res === "unable"   && <span className="jas-res-chip jas-res-na">N/A</span>}
                  {!res               && <span className="jas-res-chip">Not tested</span>}
                  {te.notes && <div className="jas-test-notes-read">{te.notes}</div>}
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function JointAssessmentSheet({ patientId, patientName = "Patient", canEdit }: Props) {
  const [doc_data,  setDocData]  = useState<AssessmentDoc>(emptyDoc());
  const [draft,     setDraft]    = useState<AssessmentDoc>(emptyDoc());
  const [editing,   setEditing]  = useState(false);
  const [saving,    setSaving]   = useState(false);
  const [saved,     setSaved]    = useState(false);
  const [loading,   setLoading]  = useState(true);
  const [expanded,  setExpanded] = useState<Record<string, boolean>>({});

  // Active joint for editing (only one expanded at a time on mobile)
  const [activeJoint, setActiveJoint] = useState<string | null>(null);

  // Load from Firestore
  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    getDoc(doc(db, "jointAssessments", patientId)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data() as Partial<AssessmentDoc>;
        const merged: AssessmentDoc = { ...emptyDoc(), ...d };
        setDocData(merged);
        setDraft(merged);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [patientId]);

  const handleSave = async () => {
    setSaving(true);
    await setDoc(doc(db, "jointAssessments", patientId), {
      ...draft,
      updatedAt: serverTimestamp(),
    });
    setDocData(draft);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCancel = () => { setDraft(doc_data); setEditing(false); };

  const d = editing ? draft : doc_data;

  const toggleJoint = useCallback((key: string, checked: boolean) => {
    const sel = checked
      ? [...d.selectedJoints, key]
      : d.selectedJoints.filter((k) => k !== key);
    const update = { ...d, selectedJoints: sel };
    if (editing) setDraft(update); else setDocData(update);
  }, [d, editing]);

  const updateJointData = useCallback((jk: string, jd: JointData) => {
    setDraft((prev) => ({ ...prev, joints: { ...prev.joints, [jk]: jd } }));
  }, []);

  const setInfo = (field: keyof AssessmentDoc, val: string) => {
    if (editing) setDraft((p) => ({ ...p, [field]: val }));
  };

  const allKeys = expandedJointKeys();

  if (loading) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "#9a9590" }}>
        Loading assessment…
      </div>
    );
  }

  return (
    <>
      {/* ─── STYLES ─────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Playfair+Display:wght@400;500;600&display=swap');

        /* ── Container ── */
        .jas-root { font-family: 'Outfit', sans-serif; color: #1a1a1a; }

        /* ── Toolbar ── */
        .jas-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px; margin-bottom: 18px;
        }
        .jas-toolbar-title {
          font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 500; color: #1a1a1a;
        }
        .jas-toolbar-sub { font-size: 13px; color: #9a9590; margin-top: 2px; }
        .jas-toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        .jas-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: 10px;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; min-height: 40px; white-space: nowrap;
        }
        .jas-btn-edit   { border: 1.5px solid #e5e0d8; background: #fff; color: #5a5550; }
        .jas-btn-edit:hover { border-color: #B3DEF0; color: #2E8BC0; background: #EAF5FC; }
        .jas-btn-save   { border: none; background: #2E8BC0; color: #fff; }
        .jas-btn-save:hover:not(:disabled) { background: #0C3C60; }
        .jas-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .jas-btn-cancel { border: 1.5px solid #e5e0d8; background: #fff; color: #9a9590; }
        .jas-btn-cancel:hover { background: #fafaf8; }
        .jas-btn-print  { border: 1.5px solid #e5e0d8; background: #f5f3ef; color: #5a5550; }
        .jas-btn-print:hover { background: #ede9e3; }
        .jas-saved-chip {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 13px; color: #1b4332; background: #d8f3dc;
          padding: 6px 12px; border-radius: 8px; font-weight: 500;
        }

        /* ── Info row ── */
        .jas-info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px; margin-bottom: 18px;
        }
        .jas-info-card {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 12px; padding: 12px 14px;
        }
        .jas-info-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: #c0bbb4; margin-bottom: 5px;
        }
        .jas-info-input {
          width: 100%; border: none; background: transparent;
          font-family: 'Outfit', sans-serif; font-size: 13.5px;
          font-weight: 500; color: #1a1a1a; outline: none;
          padding: 0; line-height: 1.4;
        }
        .jas-info-select {
          width: 100%; border: none; background: transparent;
          font-family: 'Outfit', sans-serif; font-size: 13.5px;
          font-weight: 500; color: #1a1a1a; outline: none; cursor: pointer;
        }
        .jas-info-val {
          font-size: 13.5px; font-weight: 500; color: #1a1a1a; min-height: 20px;
        }
        .jas-info-empty { color: #c0bbb4; font-weight: 400; font-style: italic; }

        /* ── Joint selector ── */
        .jas-selector-wrap {
          background: #fff; border: 1px solid #e5e0d8; border-radius: 14px;
          padding: 16px 18px; margin-bottom: 18px;
        }
        .jas-selector-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: #9a9590; margin-bottom: 12px;
        }
        .jas-selector-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 6px;
        }
        .jas-jcheck {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          cursor: pointer; transition: all 0.14s; user-select: none;
          font-size: 13px; font-weight: 500; color: #5a5550;
        }
        .jas-jcheck.checked {
          border-color: #2E8BC0; background: #EAF5FC; color: #0C3C60;
        }
        .jas-jcheck input[type="checkbox"] { display: none; }
        .jas-jcheck-dot {
          width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0;
          border: 1.5px solid #c0bbb4; background: #fff; display: flex;
          align-items: center; justify-content: center; transition: all 0.14s;
        }
        .jas-jcheck.checked .jas-jcheck-dot {
          border-color: #2E8BC0; background: #2E8BC0;
        }
        .jas-jcheck-dot-inner {
          width: 6px; height: 6px; border-radius: 2px; background: #fff;
          opacity: 0; transition: opacity 0.14s;
        }
        .jas-jcheck.checked .jas-jcheck-dot-inner { opacity: 1; }

        /* ── Joint section ── */
        .jas-joint-section {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 16px; overflow: hidden; margin-bottom: 14px;
        }
        .jas-joint-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px; cursor: pointer;
          border-bottom: 1px solid transparent; transition: background 0.12s;
        }
        .jas-joint-header:hover { background: #fafaf8; }
        .jas-joint-header.open { border-bottom-color: #e5e0d8; }
        .jas-joint-header-left { display: flex; align-items: center; gap: 12px; }
        .jas-joint-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #0C3C60, #2E8BC0);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0;
        }
        .jas-joint-title {
          font-family: 'Playfair Display', serif;
          font-size: 16px; font-weight: 500; color: #1a1a1a;
        }
        .jas-joint-subtitle { font-size: 12px; color: #9a9590; margin-top: 1px; }
        .jas-joint-summary { display: flex; align-items: center; gap: 8px; }
        .jas-joint-chip {
          font-size: 11px; font-weight: 600; padding: 3px 9px;
          border-radius: 100px; white-space: nowrap;
        }
        .jas-chip-rom   { background: #D6EEF8; color: #0C3C60; }
        .jas-chip-tests { background: #fef3c7; color: #92400e; }

        .jas-joint-body { padding: 18px 18px 20px; }

        /* ── Pain/swelling row ── */
        .jas-meta-row {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
          margin-bottom: 16px;
        }
        .jas-meta-card {
          background: #fafaf8; border: 1px solid #e5e0d8; border-radius: 10px;
          padding: 10px 13px;
        }
        .jas-meta-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: #c0bbb4; margin-bottom: 5px;
        }
        .jas-meta-input {
          width: 100%; border: none; background: transparent;
          font-family: 'Outfit', sans-serif; font-size: 13.5px;
          color: #1a1a1a; outline: none; font-weight: 500;
        }
        .jas-meta-val { font-size: 13.5px; font-weight: 500; color: #1a1a1a; min-height: 18px; }

        /* ── Sub-section header ── */
        .jas-subsection {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: #2E8BC0;
          padding: 12px 0 8px; margin-top: 14px;
          border-top: 1.5px solid #e5e0d8; display: flex; align-items: center; gap: 6px;
        }
        .jas-subsection:first-of-type { border-top: none; margin-top: 0; padding-top: 0; }
        .jas-subsection-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #2E8BC0; flex-shrink: 0;
        }

        /* ── ROM Table ── */
        .jas-table-wrap { overflow-x: auto; }
        .jas-table {
          width: 100%; border-collapse: collapse; font-size: 13px;
          table-layout: fixed;
        }
        .jas-table th {
          background: #f5f3ef; font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590;
          padding: 8px 10px; text-align: left;
          border-bottom: 1.5px solid #e5e0d8;
        }
        .jas-table td {
          padding: 7px 8px; border-bottom: 1px solid #f5f3ef;
          vertical-align: middle;
        }
        .jas-table tr:last-child td { border-bottom: none; }
        .jas-table tr:hover td { background: #fafaf8; }

        .jas-th-motion  { width: 28%; }
        .jas-th-norm    { width: 16%; }
        .jas-th-val     { width: 12%; }
        .jas-th-ef      { width: 13%; }
        .jas-th-pain    { width: 8%;  }
        .jas-td-motion  { font-weight: 500; color: #1a1a1a; }
        .jas-td-norm    { color: #9a9590; font-size: 12px; font-style: italic; }

        .jas-cell-input {
          width: 100%; border: none; border-bottom: 1.5px solid #e5e0d8;
          background: transparent; font-family: 'Outfit', sans-serif;
          font-size: 13px; color: #1a1a1a; padding: 2px 2px; outline: none;
          transition: border-color 0.15s;
        }
        .jas-cell-input:focus { border-bottom-color: #2E8BC0; }
        .jas-cell-select {
          width: 100%; border: none; border-bottom: 1.5px solid #e5e0d8;
          background: transparent; font-family: 'Outfit', sans-serif;
          font-size: 12px; color: #1a1a1a; padding: 2px; outline: none; cursor: pointer;
        }
        .jas-cell-select-sm {
          border: none; border-bottom: 1.5px solid #e5e0d8;
          background: transparent; font-family: 'Outfit', sans-serif;
          font-size: 12px; color: #1a1a1a; outline: none; cursor: pointer; width: 100%;
        }
        .jas-cell-val  { font-size: 13px; color: #1a1a1a; }
        .jas-pain-badge { font-size: 13px; font-weight: 600; }
        .jas-pain-badge.pos { color: #b91c1c; }
        .jas-td-pain { text-align: center; }

        /* ── Muscle Table ── */
        .jas-th-muscle { width: 35%; }
        .jas-th-grade  { width: 35%; }
        .jas-th-force  { width: 30%; }
        .jas-td-muscle { font-weight: 500; color: #1a1a1a; }

        .jas-device-badge {
          font-size: 9px; font-weight: 700; padding: 1px 6px;
          border-radius: 100px; background: #fef3c7; color: #92400e;
          margin-left: 4px; text-transform: uppercase; letter-spacing: 0.05em;
        }

        .jas-grade-btns { display: flex; gap: 4px; flex-wrap: wrap; }
        .jas-grade-btn {
          width: 28px; height: 28px; border-radius: 7px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
          color: #5a5550; cursor: pointer; transition: all 0.12s;
          display: flex; align-items: center; justify-content: center;
        }
        .jas-grade-btn:hover { border-color: #B3DEF0; }
        .jas-grade-btn.active { border-color: transparent; color: #fff; }
        .jas-grade-red.active    { background: #ef4444; }
        .jas-grade-orange.active { background: #f97316; }
        .jas-grade-yellow.active { background: #eab308; }
        .jas-grade-green.active  { background: #22c55e; }
        .jas-grade-chip {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 7px;
          font-size: 14px; font-weight: 700; color: #fff;
        }
        .jas-grade-red    { background: #ef4444; }
        .jas-grade-orange { background: #f97316; }
        .jas-grade-yellow { background: #eab308; }
        .jas-grade-green  { background: #22c55e; }

        /* ── Special Tests Grid ── */
        .jas-tests-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 8px;
        }
        .jas-test-card {
          border: 1.5px solid #e5e0d8; border-radius: 10px;
          padding: 10px 12px; background: #fafaf8; transition: border-color 0.12s;
        }
        .jas-test-card.jas-test-pos { border-color: #fca5a5; background: #fff5f5; }
        .jas-test-card.jas-test-neg { border-color: #86efac; background: #f0fdf4; }
        .jas-test-name {
          font-size: 12px; font-weight: 600; color: #1a1a1a;
          margin-bottom: 7px; line-height: 1.3;
        }
        .jas-test-controls { display: flex; flex-direction: column; gap: 5px; }
        .jas-test-result-btns { display: flex; gap: 4px; }
        .jas-test-res-btn {
          flex: 1; padding: 4px 6px; border-radius: 7px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all 0.12s; color: #5a5550;
        }
        .jas-test-res-positive.active { border-color: #ef4444; background: #ef4444; color: #fff; }
        .jas-test-res-negative.active { border-color: #22c55e; background: #22c55e; color: #fff; }
        .jas-test-res-unable.active   { border-color: #94a3b8; background: #94a3b8; color: #fff; }
        .jas-test-notes-input {
          width: 100%; border: none; border-bottom: 1px solid #e5e0d8;
          background: transparent; font-family: 'Outfit', sans-serif;
          font-size: 11.5px; color: #5a5550; padding: 2px 0; outline: none;
        }
        .jas-test-result-read { display: flex; flex-direction: column; gap: 4px; }
        .jas-res-chip {
          display: inline-block; font-size: 11px; font-weight: 600;
          padding: 2px 8px; border-radius: 100px;
          background: #f5f3ef; color: #9a9590;
        }
        .jas-res-pos { background: #fee2e2; color: #b91c1c; }
        .jas-res-neg { background: #d1fae5; color: #065f46; }
        .jas-res-na  { background: #f1f5f9; color: #64748b; }
        .jas-test-notes-read { font-size: 11.5px; color: #9a9590; margin-top: 2px; }

        /* ── Joint notes ── */
        .jas-notes-input {
          width: 100%; border: 1.5px solid #e5e0d8; border-radius: 9px;
          background: #fafaf8; font-family: 'Outfit', sans-serif;
          font-size: 13px; color: #1a1a1a; padding: 10px 12px;
          outline: none; resize: vertical; min-height: 60px;
          transition: border-color 0.15s; box-sizing: border-box;
        }
        .jas-notes-input:focus { border-color: #2E8BC0; background: #fff; }
        .jas-notes-read {
          font-size: 13px; color: #1a1a1a; white-space: pre-wrap;
          line-height: 1.5; min-height: 20px;
        }
        .jas-notes-empty { color: #c0bbb4; font-style: italic; }

        /* ── Impression ── */
        .jas-impression-wrap {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; padding: 18px 18px 20px; margin-bottom: 14px;
        }
        .jas-impression-title {
          font-family: 'Playfair Display', serif;
          font-size: 16px; font-weight: 500; color: #1a1a1a; margin-bottom: 10px;
        }

        /* ── Empty state ── */
        .jas-empty {
          text-align: center; padding: 60px 24px;
          background: #fafaf8; border-radius: 16px;
          border: 1.5px dashed #e5e0d8;
        }
        .jas-empty-icon { font-size: 40px; margin-bottom: 14px; }
        .jas-empty-title {
          font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 500; color: #1a1a1a; margin-bottom: 6px;
        }
        .jas-empty-sub { font-size: 14px; color: #9a9590; }

        /* ── Oxford legend ── */
        .jas-oxford-legend {
          display: flex; flex-wrap: wrap; gap: 6px;
          background: #f5f3ef; border-radius: 10px; padding: 10px 14px;
          margin-bottom: 14px;
        }
        .jas-oxford-item {
          font-size: 11.5px; color: #5a5550; white-space: nowrap;
        }
        .jas-oxford-num {
          font-weight: 700; color: #2E8BC0; margin-right: 3px;
        }

        /* ══════════════════════════════════════════════
           PRINT STYLES — A4 layout
        ══════════════════════════════════════════════ */
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          body { background: #fff !important; margin: 0; }

          /* Hide everything except the assessment */
          body > *:not(#jas-print-root) { display: none !important; }

          .jas-no-print { display: none !important; }

          .jas-root {
            font-family: 'Outfit', Arial, sans-serif;
            font-size: 10pt;
            color: #000 !important;
          }

          /* Print header */
          .jas-print-header {
            display: flex !important;
            align-items: center; justify-content: space-between;
            border-bottom: 2px solid #0C3C60; padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .jas-print-clinic-name {
            font-size: 16pt; font-weight: 700; color: #0C3C60;
            font-family: 'Playfair Display', Georgia, serif;
          }
          .jas-print-doc-title {
            font-size: 13pt; color: #2E8BC0; font-weight: 600;
            text-align: right;
          }

          /* Page setup */
          @page {
            size: A4 portrait;
            margin: 14mm 14mm 14mm 14mm;
          }

          /* Info grid */
          .jas-info-grid {
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 6px !important; margin-bottom: 12px !important;
          }
          .jas-info-card {
            border: 1px solid #ccc !important;
            padding: 6px 8px !important; border-radius: 6px !important;
          }

          /* Joint sections */
          .jas-joint-section {
            break-inside: avoid;
            border: 1px solid #ccc !important;
            border-radius: 6px !important;
            margin-bottom: 10px !important;
            overflow: visible !important;
          }
          .jas-joint-header {
            background: #f0f4f8 !important;
            padding: 8px 12px !important;
            border-bottom: 1px solid #ccc !important;
            cursor: default !important;
          }
          .jas-joint-body {
            padding: 10px 12px !important;
            display: block !important;
          }
          .jas-joint-icon { display: none !important; }
          .jas-joint-title { font-size: 12pt !important; }
          .jas-chevron { display: none !important; }

          /* Tables */
          .jas-table { font-size: 8.5pt !important; }
          .jas-table th {
            background: #e8eef4 !important;
            padding: 4px 6px !important;
            border-bottom: 1px solid #aaa !important;
            font-size: 7.5pt !important;
          }
          .jas-table td { padding: 4px 6px !important; border-bottom: 1px solid #eee !important; }
          .jas-cell-input, .jas-cell-select, .jas-cell-select-sm {
            border: none !important;
            border-bottom: 1px solid #aaa !important;
          }

          /* Muscle grades */
          .jas-grade-btns { display: flex; flex-direction: row; }
          .jas-grade-btn {
            width: 22px !important; height: 22px !important;
            font-size: 10pt !important;
            border: 1px solid #ccc !important;
          }
          .jas-grade-btn.active { color: #fff !important; }

          /* Special tests — 3 columns in print */
          .jas-tests-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 5px !important;
          }
          .jas-test-card {
            border: 1px solid #ccc !important;
            padding: 5px 7px !important;
            border-radius: 4px !important;
            break-inside: avoid;
          }
          .jas-test-name { font-size: 8pt !important; margin-bottom: 4px !important; }
          .jas-test-result-btns { gap: 3px !important; }
          .jas-test-res-btn {
            padding: 2px 4px !important; font-size: 9pt !important;
            border: 1px solid #ccc !important;
          }
          .jas-test-notes-input { border-bottom: 1px solid #aaa !important; }

          .jas-meta-row { grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; }
          .jas-meta-card { border: 1px solid #ccc !important; padding: 5px 7px !important; }

          .jas-selector-wrap { display: none !important; }

          .jas-oxford-legend { padding: 5px 8px !important; margin-bottom: 8px !important; }

          .jas-impression-wrap {
            border: 1px solid #ccc !important;
            border-radius: 6px !important;
            padding: 8px 12px !important;
            break-inside: avoid;
          }

          /* Signature line */
          .jas-signature-row { display: flex !important; }

          .jas-toolbar { display: none !important; }
        }

        /* Print-header hidden on screen */
        .jas-print-header { display: none; }
        .jas-signature-row { display: none; }
      `}</style>

      <div className="jas-root" id="jas-print-root">

        {/* Print-only header */}
        <div className="jas-print-header">
          <div>
            <div className="jas-print-clinic-name">Physio+ Hub</div>
            <div style={{ fontSize: "9pt", color: "#555", marginTop: 2 }}>
              Patient: <strong>{patientName}</strong>
            </div>
          </div>
          <div className="jas-print-doc-title">
            Sports & Athletic<br />Joint Assessment Sheet
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="jas-toolbar jas-no-print">
          <div>
            <div className="jas-toolbar-title">Joint Assessment</div>
            <div className="jas-toolbar-sub">Sports & Athletic — ROM, Muscle Power, Special Tests</div>
          </div>
          <div className="jas-toolbar-right">
            {saved && (
              <span className="jas-saved-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Saved
              </span>
            )}
            {canEdit && !editing && (
              <button className="jas-btn jas-btn-edit" onClick={() => setEditing(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit Assessment
              </button>
            )}
            {editing && (
              <>
                <button className="jas-btn jas-btn-cancel" onClick={handleCancel}>Cancel</button>
                <button className="jas-btn jas-btn-save" disabled={saving} onClick={handleSave}>
                  <Save size={13} strokeWidth={2} />
                  {saving ? "Saving…" : "Save Assessment"}
                </button>
              </>
            )}
            <button className="jas-btn jas-btn-print" onClick={() => window.print()}>
              <Printer size={13} strokeWidth={2} />
              Print / PDF
            </button>
          </div>
        </div>

        {/* ── Info grid ── */}
        <div className="jas-info-grid">
          {[
            { label: "Assessment Date", field: "date",         type: "date"   },
            { label: "Assessor",        field: "assessor",     type: "text"   },
            { label: "Sport / Activity",field: "sport",        type: "text"   },
            { label: "Dominant Side",   field: "dominantSide", type: "select" },
          ].map(({ label, field, type }) => (
            <div key={field} className="jas-info-card">
              <div className="jas-info-label">{label}</div>
              {editing ? (
                type === "select" ? (
                  <select className="jas-info-select" value={(d as Record<string,string>)[field]} onChange={(e) => setInfo(field as keyof AssessmentDoc, e.target.value)}>
                    <option value="right">Right</option>
                    <option value="left">Left</option>
                  </select>
                ) : (
                  <input className="jas-info-input" type={type} value={(d as Record<string,string>)[field]} onChange={(e) => setInfo(field as keyof AssessmentDoc, e.target.value)} placeholder="—" />
                )
              ) : (
                <div className={`jas-info-val ${!(d as Record<string,string>)[field] ? "jas-info-empty" : ""}`}>
                  {(d as Record<string,string>)[field] || "—"}
                </div>
              )}
            </div>
          ))}
          <div className="jas-info-card" style={{ gridColumn: "1 / -1" }}>
            <div className="jas-info-label">Mechanism of Injury</div>
            {editing
              ? <input className="jas-info-input" value={d.mechanism} onChange={(e) => setInfo("mechanism", e.target.value)} placeholder="Describe mechanism of injury…" />
              : <div className={`jas-info-val ${!d.mechanism ? "jas-info-empty" : ""}`}>{d.mechanism || "Not specified"}</div>}
          </div>
        </div>

        {/* ── Joint selector (edit mode) ── */}
        {(editing || d.selectedJoints.length > 0) && (
          <div className="jas-selector-wrap jas-no-print">
            <div className="jas-selector-title">Select Joints to Assess</div>
            <div className="jas-selector-grid">
              {allKeys.map(({ key, label }) => {
                const checked = d.selectedJoints.includes(key);
                return (
                  <label key={key} className={`jas-jcheck ${checked ? "checked" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={(e) => editing && toggleJoint(key, e.target.checked)} disabled={!editing} />
                    <div className="jas-jcheck-dot"><div className="jas-jcheck-dot-inner" /></div>
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* ── No joints selected ── */}
        {d.selectedJoints.length === 0 && !editing && (
          <div className="jas-empty">
            <div className="jas-empty-icon">🦴</div>
            <div className="jas-empty-title">No Assessment Recorded</div>
            <div className="jas-empty-sub">
              {canEdit ? "Click \"Edit Assessment\" to begin the joint assessment." : "The physiotherapist has not yet completed the joint assessment."}
            </div>
          </div>
        )}

        {/* ── Oxford Scale Legend ── */}
        {d.selectedJoints.length > 0 && (
          <div className="jas-oxford-legend jas-no-print">
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9a9590", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 8 }}>Oxford Scale</span>
            {[
              ["0","No contraction"],
              ["1","Trace/flicker"],
              ["2","Against gravity eliminated"],
              ["3","Against gravity"],
              ["4","Against some resistance"],
              ["5","Full normal power"],
            ].map(([n, desc]) => (
              <span key={n} className="jas-oxford-item">
                <span className="jas-oxford-num">{n}</span>= {desc}
              </span>
            ))}
          </div>
        )}

        {/* ── Joint sections ── */}
        {allKeys
          .filter(({ key }) => d.selectedJoints.includes(key))
          .map(({ key, label, jointId }) => {
            const jDef   = JOINTS[jointId];
            const jData  = (editing ? draft : doc_data).joints[key] ?? emptyJoint();
            const isOpen = expanded[key] !== false; // default open
            const romCount = Object.values(jData.rom).filter((r) => r.active || r.passive).length;
            const posTests = Object.values(jData.tests).filter((t) => t.result === "positive").length;

            const JOINT_ICONS: Record<string,string> = {
              cervical:"🔠",thoracic:"🫁",lumbar:"🧘",
              shoulder:"💪",elbow:"🦾",wrist:"✋",
              hip:"🏃",knee:"🦵",ankle:"🦶",
            };

            return (
              <div key={key} className="jas-joint-section">
                {/* Header */}
                <div
                  className={`jas-joint-header ${isOpen ? "open" : ""}`}
                  onClick={() => setExpanded((e) => ({ ...e, [key]: !isOpen }))}
                >
                  <div className="jas-joint-header-left">
                    <div className="jas-joint-icon jas-no-print">{JOINT_ICONS[jointId] ?? "🦴"}</div>
                    <div>
                      <div className="jas-joint-title">{label}</div>
                      <div className="jas-joint-subtitle">
                        {jDef.motions.length} motions · {jDef.muscles.length} muscles · {jDef.specialTests.length} special tests
                      </div>
                    </div>
                  </div>
                  <div className="jas-joint-summary">
                    {romCount > 0 && (
                      <span className="jas-joint-chip jas-chip-rom">{romCount} ROM</span>
                    )}
                    {posTests > 0 && (
                      <span className="jas-joint-chip jas-chip-tests">{posTests} positive</span>
                    )}
                    <div className="jas-chevron">
                      {isOpen
                        ? <ChevronUp size={16} strokeWidth={2} color="#9a9590" />
                        : <ChevronDown size={16} strokeWidth={2} color="#9a9590" />}
                    </div>
                  </div>
                </div>

                {/* Body */}
                {isOpen && (
                  <div className="jas-joint-body">

                    {/* Pain / Swelling / Mechanism */}
                    <div className="jas-meta-row">
                      {[
                        { label: "Pain (NRS 0–10)", field: "pain"     },
                        { label: "Swelling",        field: "swelling" },
                        { label: "Local Notes",     field: "notes"    },
                      ].map(({ label: ml, field }) => (
                        <div key={field} className="jas-meta-card">
                          <div className="jas-meta-label">{ml}</div>
                          {editing
                            ? <input className="jas-meta-input" value={(jData as Record<string,string>)[field]} placeholder="—" onChange={(e) => updateJointData(key, { ...jData, [field]: e.target.value })} />
                            : <div className={`jas-meta-val ${!(jData as Record<string,string>)[field] ? "jas-notes-empty" : ""}`}>{(jData as Record<string,string>)[field] || "—"}</div>}
                        </div>
                      ))}
                    </div>

                    {/* ROM */}
                    <div className="jas-subsection"><div className="jas-subsection-dot"/>Range of Motion</div>
                    <ROMTable
                      jointId={jointId} jointKey={key}
                      data={jData} canEdit={editing}
                      onChange={updateJointData}
                    />

                    {/* Muscle Power */}
                    <div className="jas-subsection"><div className="jas-subsection-dot"/>Muscle Power</div>
                    <MuscleTable
                      jointId={jointId} jointKey={key}
                      data={jData} canEdit={editing}
                      onChange={updateJointData}
                    />

                    {/* Special Tests */}
                    <div className="jas-subsection"><div className="jas-subsection-dot"/>Special Tests</div>
                    <SpecialTestsGrid
                      jointId={jointId} jointKey={key}
                      data={jData} canEdit={editing}
                      onChange={updateJointData}
                    />

                  </div>
                )}
              </div>
            );
          })}

        {/* ── Clinical Impression ── */}
        {d.selectedJoints.length > 0 && (
          <div className="jas-impression-wrap">
            <div className="jas-impression-title">Clinical Impression & Recommendations</div>
            {editing
              ? <textarea className="jas-notes-input" value={draft.impression} onChange={(e) => setDraft((p) => ({ ...p, impression: e.target.value }))} placeholder="Summarise findings, clinical impression, proposed treatment, and goals…" rows={4} />
              : <div className={`jas-notes-read ${!d.impression ? "jas-notes-empty" : ""}`}>{d.impression || "Not recorded."}</div>}
          </div>
        )}

        {/* ── Signature row (print only) ── */}
        <div className="jas-signature-row" style={{ display: "none", marginTop: 30, borderTop: "1px solid #ccc", paddingTop: 16, gap: 40 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: "1px solid #555", marginBottom: 4, height: 32 }} />
            <div style={{ fontSize: "8.5pt", color: "#555" }}>Assessor Signature</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: "1px solid #555", marginBottom: 4, height: 32 }} />
            <div style={{ fontSize: "8.5pt", color: "#555" }}>Patient Signature</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "8.5pt", color: "#555", marginTop: 36 }}>Date: {d.date || "____________"}</div>
          </div>
        </div>

      </div>
    </>
  );
}
