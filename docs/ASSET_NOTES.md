# Asset Notes

## A1 — Asset acquisition and validation

**Status:** A1 gate **PASSED** (2026-08-20).

**Asset:** `apps/web/public/models/brunette.glb`

**Source:** Sample avatar bundled with [TalkingHead.js](https://github.com/met4citizen/talkinghead) (`avatars/brunette.glb`), Option A per PROJECT_PLAN.md §5.1's decision rule.

**Licence: CC BY-NC 4.0 — non-commercial only.** Per the TalkingHead.js README: *"Example avatar 'brunette.glb' was created at [Ready Player Me](https://readyplayer.me/). The avatar is free to all developers for non-commercial use under the [CC BY-NC 4.0 DEED](https://creativecommons.org/licenses/by-nc/4.0/)."*

> **⚠️ Must be replaced before any commercial launch.** This was a deliberate, discussed trade-off (see docs/DECISIONS.md ADR-006) — it unblocks the avatar spike immediately with a known-good rig, at the cost of a required asset swap before Phase 7 (deploy). Do not ship this file in a commercial build.

**Rig/blendshapes (via `pnpm inspect-glb apps/web/public/models/brunette.glb`):**

- Mixamo-compatible humanoid rig
- 10 meshes; 4 carry morph targets (`EyeLeft`, `EyeRight`, `Wolf3D_Head`, `Wolf3D_Teeth` — 72 targets each, same ARKit+Oculus set shared across all four)
- **All 15 Oculus viseme shapes present:** `viseme_sil, viseme_PP, viseme_FF, viseme_TH, viseme_DD, viseme_kk, viseme_CH, viseme_SS, viseme_nn, viseme_RR, viseme_aa, viseme_E, viseme_I, viseme_O, viseme_U`
- Full ARKit facial shape set also present (`jawOpen`, `mouthFunnel`, `mouthPucker`, `mouthClose`, `mouthSmile`, `browDownLeft`, etc.) — a second ARKit-name visemeMap is available if ever needed, though the Oculus set is used directly per §7.
- Eye-blink shapes present: `eyeBlinkLeft`, `eyeBlinkRight`, `eyesClosed`
- **No bundled animation clips** — body animation clips (idle, talking, gestures) come from Mixamo FBX retargeting in A4, not from this file.

**Poly count / file size:**

| | Value | Budget (§5.1) |
|---|---|---|
| Triangles | 13,317 | ≤ 60,000 |
| File size (uncompressed) | 4.50 MB | ≤ 8 MB (Draco-compressed) |

Already well within both budgets uncompressed — Draco compression not yet applied, and likely unnecessary at this size, but revisit if later custom assets run larger.

**Gate result:** ✅ PASS — full Oculus viseme set + eye-blink shapes + within triangle/size budget. Proceeding to A2 (static render).
