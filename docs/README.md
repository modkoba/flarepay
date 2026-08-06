# Docs Directory

```
docs/
├── README.md                  ← this file
├── MEMORY.md                  ← project memory (facts, decisions, context)
│
├── planning/                  ← strategic docs: why, what, when
│   ├── IDEA.md                ← mission, pitch, problem statement
│   ├── PRD.md                 ← product requirements, scope, success criteria
│   └── DEMO_PLAN.md           ← demo app plan, screens, deployment
│
├── research/                  ← Phase 0: what we learned from the FDC protocol
│   ├── RESEARCH_NOTES.md      ← contract addresses, flow, ABIs, attestation types
│   ├── BENCHMARK.md           ← manual vs SDK flow comparison (timings)
│   └── PHASE0_STATUS.md       ← what's done, what's left, pitfalls
│
├── design/                    ← architecture and API design
│   ├── API_DESIGN.md          ← SDK public API, types, error hierarchy
│   └── SEQUENCE_DIAGRAMS.md   ← flow diagrams for each attestation type
│
└── tasks/                     ← execution: what to build and in what order
    └── ACTION_ITEMS.md        ← phase-by-phase task breakdown
```

### Conventions

- **planning/** — written once, rarely changes. Defines product direction.
- **research/** — Phase 0 output. Reference material for building the SDK.
- **design/** — evolves during Phase 1. API contracts before implementation.
- **tasks/** — the build checklist. Items checked off as they land.
