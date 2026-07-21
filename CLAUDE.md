# Physio Hub — Claude Code Project Context

## Project
Physiotherapy clinic management SPA. React + TypeScript (Vite), Firebase Firestore, Firebase Auth, Firebase Hosting, Firebase Cloud Functions (Node.js Gen 2), Anthropic Claude API.

- **Live URL:** https://physioplus.app (Firebase Hosting custom domain — `physio-hub-ae4c9`)
- **GitHub:** https://github.com/hassanfayek/physio-hub
- **Firebase project:** `physio-hub-ae4c9`

## Deploy workflow
```
npm run build          # always build first
firebase deploy --only hosting      # frontend
firebase deploy --only functions    # cloud functions (when changed)
git add <files> && git commit && git push origin main
```

## Key rules

### Firestore rules — MUST update immediately
Any new Firestore collection reference (`collection(db, "X")`) needs a matching rule in `firestore.rules` **before finishing the feature**. Default deny means permission errors otherwise. After editing rules: `firebase deploy --only firestore:rules`.

Permission patterns:
- Patient data: `read: isStaff() || isPatient()` / `write: isManager() || isPhysio()`
- Admin/config: `read: isStaff()` / `write: isManager()`
- Billing: `read/write: isManager() || isSecretary()`

### Tech notes
- Cloud Functions timeout: set `timeoutSeconds: 120` for any function calling the Claude API
- YouTube Shorts: stored as full URL (`youtube.com/shorts/ID`), opened externally — never embedded
- Assessment history: Firestore subcollection `jointAssessmentHistory/{patientId}/snapshots/{date}`
- Muscle data uses Force (N), Time to Peak (s), Firing Duration (s) — Oxford grading removed

## Memory files
Persistent memory lives in `.claude/memory/`. On a new machine, copy those files to:
`~/.claude/projects/c--Users-fayek-physio-hub/memory/`
