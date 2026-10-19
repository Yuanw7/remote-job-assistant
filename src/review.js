import { hash } from './domain.js';
import { jobVersion } from './requirements.js';
export const REVIEW_DECISIONS = ['shortlist', 'hold', 'skip'];
export function reviewContext(job, profile, trackId) {
  if (!profile.candidate_id || profile.is_example) throw new Error('审核记录需要非示例画像和 candidate_id');
  if (!profile.tracks?.some(t => t.id === trackId)) throw new Error('审核必须指定画像中有效的 --track');
  return { candidate_id: profile.candidate_id, job_id: job.id, track_id: trackId, profile_hash: hash(profile), job_hash: jobVersion(job) };
}
export function saveReview(store, job, profile, trackId, decision, note) {
  if (!REVIEW_DECISIONS.includes(decision)) throw new Error('decision 必须为 shortlist / hold / skip');
  if (!note?.trim()) throw new Error('请用 --note 记录审核理由');
  if (note.length > 4000) throw new Error('审核理由最多 4000 字符');
  const record = { ...reviewContext(job, profile, trackId), decision, note: note.trim() };
  return store.addReview(record);
}
export function currentReview(store, job, profile, trackId) {
  if (!profile.candidate_id || !trackId || profile.is_example) return null;
  const context = reviewContext(job, profile, trackId);
  const review = store.latestReview(context);
  return review ? { ...review, stale: review.profile_hash !== context.profile_hash || review.job_hash !== context.job_hash } : null;
}
