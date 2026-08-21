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

---

## Candidate register (2026-08-20)

Assets are now a registry (`apps/web/src/avatar/avatarAssets.ts`) rather than a constant, with a dev-only switcher in the leva "Avatar asset" folder. All entries pass `pnpm inspect-glb` and are driven by the same lip-sync engine with no per-asset code.

| Asset | File | Size | Tris | Register | Licence |
|---|---|---|---|---|---|
| **Netra (VRoid)** — default | `netra.glb` | 3.63 MB | 55.4k | Anime / stylised | User-authored in VRoid Studio; ARKit 52 transferred from the hinzka donor (ADR-012) |
| **Avaturn** — alternate | `avaturn.glb` | 6.18 MB | 31.2k | Semi-realistic | Avaturn free-tier export — **non-commercial only** |
| ~~brunette.glb~~ | `brunette.glb` | 4.5 MB | 13.3k | Superseded (ADR-006) | CC BY-NC 4.0 — no longer referenced by code |

### On the Avaturn candidate

Kept deliberately as the semi-realistic option, and it satisfies parts of the spec the VRoid asset does not:

- **§2.2:** separate `Teeth_Mesh` and `Tongue_Mesh` (the VRoid face fuses teeth and tongue into the head mesh)
- **§2.4:** Mixamo bone names (`Head`, `LeftEye`, `RightEye`, full finger joints) — Mixamo clips retarget without manual work
- **§2.3:** both the ARKit set *and* all 15 Oculus visemes
- **§1.3:** the outfit is already on-brief — tailored black single-breasted blazer, white shell top, matte, no gloss

**Known issues:**

- **Footwear is off-brief** (§1.3 wants a low block heel or flat). It is a separate mesh (`avaturn_shoes_0`), so the registry hides it via `hiddenMeshes` until it is replaced in Avaturn. Rarely in frame at the default camera either way.
- **Licence:** free-tier Avaturn exports are non-commercial. Same constraint as the old `brunette.glb` — fine for development, must be resolved (paid tier or a different asset) before anything public.
- Rig quirk: the arm bones' local Z runs down the limb, so Z twists and **X** is the swing axis, and both arms lower with the *same* sign rather than mirrored ones. Encoded in `MIXAMO_ARMS_DOWN`.
