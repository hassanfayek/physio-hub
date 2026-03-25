<!--
SYNC IMPACT REPORT
==================
Version change: (template / unversioned) → 1.0.0
Modified principles: all (initial population from template placeholders)
Added sections:
  - Core Principles (I–V)
  - Technology Stack
  - Development Workflow
  - Governance
Removed sections: none (template comments stripped)
Templates reviewed:
  - .specify/templates/plan-template.md  ✅ Constitution Check section aligns
  - .specify/templates/spec-template.md  ✅ No constitution-specific constraints to add
  - .specify/templates/tasks-template.md ✅ Task categories align with principles
Deferred TODOs: none — all placeholders resolved
-->

# PhysioHub Web Constitution

## Core Principles

### I. Feature-Domain Architecture

All source code MUST be organized by feature domain under `src/features/<domain>/`.
Shared, reusable React components MUST live in `src/components/`. Cross-cutting hooks
MUST live in `src/hooks/`. Data-access and external-service logic MUST live in
`src/services/`. No business logic is permitted directly inside `src/App.tsx` or
entry files.

**Rationale**: A feature-first layout makes it easy to locate, modify, and delete
a capability without touching unrelated code. It also enforces clear ownership
boundaries when the team grows.

### II. Firebase-First Data Layer

All data persistence, real-time subscriptions, and file storage MUST go through
Firebase (Firestore, Firebase Auth, Firebase Storage). Service wrappers in
`src/services/` MUST be the single point of contact with Firebase SDKs — no
component or hook MAY import Firebase modules directly.

**Rationale**: Centralizing Firebase access prevents scattered, hard-to-mock SDK
calls and makes future backend migrations a single-file change per service.

### III. Type Safety (NON-NEGOTIABLE)

TypeScript strict mode MUST be enabled and respected throughout the codebase.
All component props, hook return values, and service contracts MUST have explicit
type annotations. The `any` type is forbidden; use `unknown` with type guards
where the shape is truly indeterminate. Type assertions (`as Foo`) MUST include
a comment explaining why the assertion is safe.

**Rationale**: This is a healthcare-adjacent application. Silent type errors
translate directly into incorrect patient data displayed or stored.

### IV. Role-Based Access Control

Every protected route MUST be wrapped in `ProtectedRoute` with an explicit
`requiredRole`. Role-specific views (patient portal vs. physio portal) MUST
never expose or fetch cross-role data. The canonical roles are:
`patient`, `physiotherapist`, `clinic_manager`, `secretary`. New roles MUST be
added to `useAuth` and `App.tsx` before any UI work begins.

**Rationale**: Exposing patient records to unauthorized roles is a privacy and
regulatory risk. RBAC is enforced at the route level as a hard gate, not a
UI-only hint.

### V. Simplicity & YAGNI

New abstractions MUST have at least three concrete, existing use cases before
being introduced. Components MUST do one thing. Files SHOULD stay under 300 lines;
exceeding this requires justification. Complexity MUST be documented in the
Complexity Tracking table of the feature plan.

**Rationale**: The codebase is maintained by a small team. Premature abstractions
create cognitive overhead and make the code harder to change, not easier.

## Technology Stack

- **Language**: TypeScript 5 (strict mode)
- **Framework**: React 19 with functional components and hooks only
- **Build tool**: Vite 7
- **Backend / BaaS**: Firebase 12 (Auth, Firestore, Storage)
- **Routing**: React Router DOM (BrowserRouter)
- **Package manager**: pnpm
- **Linting**: ESLint 9 with TypeScript-ESLint and React Hooks plugins
- **Target platform**: Modern web browsers (evergreen); no IE/legacy support

New runtime dependencies MUST be approved before being added. Prefer Firebase
SDK built-ins over third-party equivalents that duplicate functionality.

## Development Workflow

- Branch names MUST follow `###-short-description` (sequential numbering per
  speckit convention).
- Every feature MUST have a spec in `specs/<###-feature-name>/spec.md` before
  implementation begins.
- Pull requests MUST pass TypeScript type-check (`tsc --noEmit`) and ESLint
  with zero errors before merge.
- Firebase Security Rules changes MUST be reviewed alongside any data-model
  change — they are part of the same feature.

## Governance

This constitution supersedes all other documented practices. When a conflict
arises between this document and inline code comments or README text, this
constitution takes precedence.

**Amendment procedure**:
1. Propose the change in a PR, updating this file with an incremented version.
2. Bump version using semantic rules:
   - MAJOR — principle removed or its non-negotiable constraint redefined.
   - MINOR — new principle or section added; material expansion of guidance.
   - PATCH — clarifications, wording, typo fixes.
3. Update the Sync Impact Report comment at the top of this file.
4. Propagate any impacts to templates listed in the report.

All PRs and code reviews MUST verify compliance with the principles above.
Violations MUST be documented in the Complexity Tracking table of the relevant
plan and approved before merging.

**Version**: 1.0.0 | **Ratified**: 2026-03-26 | **Last Amended**: 2026-03-26
