import hashlib, json, os, sqlite3, time
from datetime import datetime, timezone
from pathlib import Path
from app.config import get_settings

settings = get_settings()
DB_PATH = Path(settings.cache_db_path)
if not DB_PATH.is_absolute(): DB_PATH = Path(__file__).resolve().parents[2] / DB_PATH
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

class PersistentCache:
    def __init__(self):
        with sqlite3.connect(DB_PATH) as db:
            db.execute('CREATE TABLE IF NOT EXISTS response_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS api_usage (month TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)')

    @staticmethod
    def key(endpoint, params):
        raw = json.dumps([endpoint, params], sort_keys=True, ensure_ascii=False, default=str)
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, key):
        now = time.time()
        with sqlite3.connect(DB_PATH) as db:
            row = db.execute('SELECT payload, expires FROM response_cache WHERE key=?', (key,)).fetchone()
            if not row: return None
            if row[1] < now:
                db.execute('DELETE FROM response_cache WHERE key=?', (key,)); return None
            try: return json.loads(row[0])
            except Exception: return None

    def set(self, key, value, ttl):
        now = time.time()
        with sqlite3.connect(DB_PATH) as db:
            db.execute('INSERT OR REPLACE INTO response_cache(key,payload,created,expires) VALUES(?,?,?,?)', (key, json.dumps(value, ensure_ascii=False), now, now+ttl))

    def usage(self):
        month = datetime.now(timezone.utc).strftime('%Y-%m')
        with sqlite3.connect(DB_PATH) as db:
            row = db.execute('SELECT calls FROM api_usage WHERE month=?', (month,)).fetchone()
        return {'month': month, 'calls': row[0] if row else 0, 'limit': settings.rapidapi_monthly_limit, 'reserve': settings.rapidapi_reserve_calls, 'available': max(0, settings.rapidapi_monthly_limit-settings.rapidapi_reserve_calls-(row[0] if row else 0))}

    def consume_call(self):
        month = datetime.now(timezone.utc).strftime('%Y-%m')
        with sqlite3.connect(DB_PATH) as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT calls FROM api_usage WHERE month=?', (month,)).fetchone()
            calls = row[0] if row else 0
            if calls >= max(0, settings.rapidapi_monthly_limit-settings.rapidapi_reserve_calls):
                db.rollback(); return False
            db.execute('INSERT INTO api_usage(month,calls) VALUES(?,1) ON CONFLICT(month) DO UPDATE SET calls=calls+1', (month,))
            db.commit(); return True

cache = PersistentCache()
# Backwards-compatible interface for older service modules.
class SimpleCache:
    def __init__(self, ttl=3600): self.ttl=ttl; self._memory={}
    def get(self,key):
        row=self._memory.get(key)
        if not row: return None
        value,ts=row
        if time.time()-ts>self.ttl: self._memory.pop(key,None); return None
        return value
    def set(self,key,value): self._memory[key]=(value,time.time())
    def clear(self): self._memory.clear()
    def size(self): return len(self._memory)
