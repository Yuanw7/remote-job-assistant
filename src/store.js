import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash, jobKey } from './domain.js';

export function openStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS listings (source TEXT NOT NULL, external_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), url TEXT NOT NULL, PRIMARY KEY(source, external_id));
    CREATE TABLE IF NOT EXISTS snapshots (hash TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), body TEXT NOT NULL, observed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, source TEXT NOT NULL, started_at TEXT NOT NULL, status TEXT NOT NULL, count INTEGER NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, candidate_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id), track_id TEXT NOT NULL, profile_hash TEXT NOT NULL, job_hash TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('shortlist','hold','skip')), note TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS review_lookup ON reviews(candidate_id,job_id,track_id,id);
    PRAGMA user_version = 2;`);
  return {
    save(job) {
      const id = jobKey(job), now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        const existing = db.prepare('SELECT body FROM jobs WHERE id=?').get(id);
        // Preserve the authoritative ATS version when an aggregator later reports the same posting.
        const chosen = existing && JSON.parse(existing.body).source === 'greenhouse' && job.source !== 'greenhouse' ? JSON.parse(existing.body) : job;
        db.prepare('INSERT INTO jobs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,last_seen=excluded.last_seen').run(id, JSON.stringify(chosen), now, now);
        db.prepare('INSERT INTO listings VALUES(?,?,?,?) ON CONFLICT(source,external_id) DO UPDATE SET job_id=excluded.job_id,url=excluded.url').run(job.source, String(job.external_id), id, job.source_url);
        db.prepare('INSERT OR IGNORE INTO snapshots VALUES(?,?,?,?)').run(hash({ id, job }), id, JSON.stringify(job), now);
        db.exec('COMMIT');
        return !existing;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    jobs() { return db.prepare('SELECT * FROM jobs ORDER BY last_seen DESC').all().map(row => ({ ...JSON.parse(row.body), id: row.id, first_seen: row.first_seen, last_seen: row.last_seen, sources: db.prepare('SELECT source,url FROM listings WHERE job_id=?').all(row.id) })); },
    run(source, status, count, error = null) { db.prepare('INSERT INTO runs(source,started_at,status,count,error) VALUES(?,?,?,?,?)').run(source, new Date().toISOString(), status, count, error); },
    runs() { return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 20').all(); },
    lastSuccess(source) { return db.prepare("SELECT started_at FROM runs WHERE source=? AND status='ok' ORDER BY id DESC LIMIT 1").get(source)?.started_at; },
    addReview(r) {
      const result = db.prepare('INSERT INTO reviews(candidate_id,job_id,track_id,profile_hash,job_hash,decision,note,created_at) VALUES(?,?,?,?,?,?,?,?)').run(r.candidate_id,r.job_id,r.track_id,r.profile_hash,r.job_hash,r.decision,r.note,new Date().toISOString());
      return Number(result.lastInsertRowid);
    },
    latestReview(c) { return db.prepare('SELECT * FROM reviews WHERE candidate_id=? AND job_id=? AND track_id=? ORDER BY id DESC LIMIT 1').get(c.candidate_id,c.job_id,c.track_id) || null; },
    close() { db.close(); }
  };
}
