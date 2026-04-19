# CPU profile reference (main-thread hotspots)

Snapshot derived from the validated profile summarized in
`cpu-profile-2026-04-12T17-30-48-117Z-aih5q3-summary.md` (47s capture, real app
flow).

## Top self-time (non-idle)

| Rank | Function                | Notes                                                       |
| ---- | ----------------------- | ----------------------------------------------------------- |
| 1    | `lsGet`                 | localStorage read + decompress path                         |
| 2–3  | `getBoundingClientRect` | layout reads (DOM/snapshot tooling)                         |
| 4    | `compress`              | `rawSet` → `compress` before `setItem`                      |
| 5    | `getDayData`            | calendar / active-days path; `getActiveDaysForMonth` caller |

## Hot call edges (validated)

- `rawSet` → `compress`
- `getActiveDaysForMonth` → `getDayData`

## Follow-up implemented in code (2026-04-13)

- Smaller JSON fast path in `compress` (skip pattern pass when payload is tiny).
- Parsed `dayv2_*` blob cache in `getDayData` (same raw string → skip
  `JSON.parse` / decompress).
- Single-flight API health warm-up flag shared by cloud init and initialize
  fallback.

Re-run profiling after deploy when comparing iterations; absolute ms vary by
device and dataset size.
