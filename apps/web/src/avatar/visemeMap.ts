import type { VisemeId } from '@netra/contracts';

/**
 * Azure Speech viseme ID → Oculus morph target name (PROJECT_PLAN.md §7).
 * Baseline mapping, tuned by eye during A3 — not gospel.
 */
export const VISEME_MAP: Record<VisemeId, string> = {
  0: 'viseme_sil',
  1: 'viseme_aa',
  2: 'viseme_aa',
  3: 'viseme_O',
  4: 'viseme_E',
  5: 'viseme_E',
  6: 'viseme_I',
  7: 'viseme_U',
  8: 'viseme_O',
  9: 'viseme_aa',
  10: 'viseme_O',
  11: 'viseme_aa',
  12: 'viseme_sil',
  13: 'viseme_RR',
  14: 'viseme_nn',
  15: 'viseme_SS',
  16: 'viseme_CH',
  17: 'viseme_TH',
  18: 'viseme_FF',
  19: 'viseme_DD',
  20: 'viseme_kk',
  21: 'viseme_PP',
};

/** Every morph target name VISEME_MAP can ever produce — used to zero the rest each frame. */
export const ALL_VISEME_TARGETS: readonly string[] = [...new Set(Object.values(VISEME_MAP))];
