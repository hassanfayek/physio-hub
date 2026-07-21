---
name: Always update Firestore rules when adding new collections
description: Any time code references a new Firestore collection, immediately add a matching rule to firestore.rules — without waiting for a permission error
type: feedback
---

After every new feature, the user hits a "permission denied" error because new Firestore collections are added in code but the corresponding `firestore.rules` entry is missed.

**Why:** Firebase Firestore denies all access by default when no rule matches. Every `collection(db, "newCollection")` or `doc(db, "newCollection", id)` reference needs a corresponding `match /newCollection/{docId}` block in `apps/web/firestore.rules`. The rules file is NOT auto-updated — it must be edited manually.

**How to apply:**
- When adding any feature that reads or writes Firestore (new service file, new collection reference, new sub-collection), IMMEDIATELY check if `firestore.rules` already covers that collection.
- If not, add the appropriate rule block before finishing the feature — do not wait for the user to report a permission error.
- Standard permission pattern for this project:
  - Patient data: `read: isStaff() || isPatient()` / `write: isManager() || isPhysio()`
  - Admin/config data: `read: isStaff()` / `write: isManager()`
  - Billing: `read/write: isManager() || isSecretary()`
  - Manager-only: `read/write: isManager()`
- Also remind the user to deploy rules after changes: `firebase deploy --only firestore:rules`
