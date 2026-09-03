const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

// ─── Redemption tiers (mirrors src/services/pointsService.ts LOYALTY_TIERS) ──

const TIERS = [
  { points: 1000,  value: 80   },
  { points: 2500,  value: 220  },
  { points: 5000,  value: 475  },
  { points: 7500,  value: 750  },
  { points: 10000, value: 1100 },
  { points: 15000, value: 1800 },
];

const VOUCHER_VALIDITY_DAYS = 90;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I — avoids misreads

function generateVoucherCode() {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return code;
}

// ─── POST-equivalent onCall: redeem points → voucher ──────────────────────────

exports.redeemLoyaltyPoints = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const callerDoc = await admin.firestore().collection("users").doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== "patient") {
    throw new HttpsError("permission-denied", "Only patients can redeem their own points.");
  }

  const tierPoints = request.data?.tierPoints;
  const tier = TIERS.find((t) => t.points === tierPoints);
  if (!tier) {
    throw new HttpsError("invalid-argument", "Invalid redemption tier.");
  }

  const patientId  = request.auth.uid;
  const db         = admin.firestore();
  const pointsRef  = db.collection("patientPoints").doc(patientId);
  const ledgerRef  = db.collection("pointsLedger").doc();
  const voucherRef = db.collection("pointsVouchers").doc();

  const now = admin.firestore.Timestamp.now();
  const voucherExpiresAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + VOUCHER_VALIDITY_DAYS * 24 * 60 * 60 * 1000
  );
  const code = generateVoucherCode();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(pointsRef);
    const current = snap.exists ? snap.data() : {};
    const balance = current.balance ?? 0;

    if (balance < tier.points) {
      throw new HttpsError("failed-precondition", "Insufficient points balance.");
    }

    tx.set(pointsRef, {
      balance:          balance - tier.points,
      lifetimeEarned:   current.lifetimeEarned ?? 0,
      lifetimeRedeemed: (current.lifetimeRedeemed ?? 0) + tier.points,
      lifetimeExpired:  current.lifetimeExpired ?? 0,
      updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(ledgerRef, {
      patientId,
      type:        "redeem",
      points:      -tier.points,
      sourceType:  "voucher",
      sourceId:    voucherRef.id,
      description: `Redeemed ${tier.points} pts for a ${tier.value} EGP voucher`,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(voucherRef, {
      patientId,
      tier:                 tier.points,
      pointsCost:           tier.points,
      voucherValue:         tier.value,
      code,
      status:               "active",
      createdAt:            admin.firestore.FieldValue.serverTimestamp(),
      voucherExpiresAt,
      appliedAt:            null,
      appliedAppointmentId: "",
      appliedAmount:        0,
    });
  });

  const voucherSnap = await voucherRef.get();
  return { voucher: { id: voucherRef.id, ...voucherSnap.data() } };
});

// ─── Scheduled: expire points 12 months after they were earned ───────────────

exports.expireLoyaltyPoints = onSchedule(
  { schedule: "every day 03:00", timeZone: "Africa/Cairo" },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const staleSnap = await db.collection("pointsLedger")
      .where("type", "==", "earn")
      .where("processed", "==", false)
      .where("expiresAt", "<=", now)
      .limit(200)
      .get();

    for (const entryDoc of staleSnap.docs) {
      const entry = entryDoc.data();
      const pointsRef = db.collection("patientPoints").doc(entry.patientId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(pointsRef);
        const current = snap.exists ? snap.data() : {};
        const balance = current.balance ?? 0;
        const toExpire = Math.min(entry.points, balance);

        if (toExpire > 0) {
          tx.set(pointsRef, {
            balance:          balance - toExpire,
            lifetimeEarned:   current.lifetimeEarned ?? 0,
            lifetimeRedeemed: current.lifetimeRedeemed ?? 0,
            lifetimeExpired:  (current.lifetimeExpired ?? 0) + toExpire,
            updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });

          tx.set(db.collection("pointsLedger").doc(), {
            patientId:   entry.patientId,
            type:        "expire",
            points:      -toExpire,
            sourceType:  "expiry",
            sourceId:    entryDoc.id,
            description: `${toExpire} pts expired (earned 12+ months ago)`,
            createdAt:   admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        tx.update(entryDoc.ref, { processed: true });
      });
    }

    console.log(`expireLoyaltyPoints: processed ${staleSnap.size} stale earn entries`);
  }
);
