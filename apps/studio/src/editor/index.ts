/**
 * LaudStudio editor (WP-104): "interpretation always, chart until link".
 *  - ./apply — interpretation ops (sections/grid/chords/LRC), always allowed
 *  - ./chart — chart edits + re-key under the ownership lock (DEC-68) and
 *    mapping review (DEC-63)
 */
export type { EditOperation, EditResult } from './types';
export { applyEdit } from './apply';
export {
  chartAccess,
  rekeySong,
  reviewMapRow,
  setChart,
  type ChartAccess,
  type ChartUpdateResult,
  type MapReviewAction,
} from './chart';
