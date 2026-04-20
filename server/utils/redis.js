'use strict';
/**
 * Redis client with in-memory fallback.
 * Uses Redis if REDIS_URL is set in environment, otherwise uses in-memory Map.
 * API is intentionally Promise-based to be drop-in replaceable with ioredis/redis v4.
 */

class InMemoryStore {
    constructor() {
        this._store    = new Map(); // key → value
        this._expiries = new Map(); // key → expiry timestamp (ms)
        this._hashes   = new Map(); // key → Map<field, value>
    }

    _isExpired(key) {
        const exp = this._expiries.get(key);
        if (exp === null || exp === undefined) return false;
        if (Date.now() > exp) {
            this._store.delete(key);
            this._expiries.delete(key);
            this._hashes.delete(key);
            return true;
        }
        return false;
    }

    async get(key) {
        if (this._isExpired(key)) return null;
        const val = this._store.get(key);
        return val !== undefined ? val : null;
    }

    async set(key, value, ttlSeconds) {
        this._store.set(key, String(value));
        if (ttlSeconds !== null && ttlSeconds !== undefined) {
            this._expiries.set(key, Date.now() + ttlSeconds * 1000);
        }
        return 'OK';
    }

    async del(...keys) {
        let count = 0;
        for (const key of keys) {
            if (this._store.delete(key) || this._hashes.delete(key)) count++;
            this._expiries.delete(key);
        }
        return count;
    }

    async expire(key, ttlSeconds) {
        if (!this._store.has(key) && !this._hashes.has(key)) return 0;
        this._expiries.set(key, Date.now() + ttlSeconds * 1000);
        return 1;
    }

    async hget(key, field) {
        if (this._isExpired(key)) return null;
        const hash = this._hashes.get(key);
        if (!hash) return null;
        return hash.get(field) !== undefined ? hash.get(field) : null;
    }

    async hset(key, field, value) {
        if (!this._hashes.has(key)) this._hashes.set(key, new Map());
        this._hashes.get(key).set(field, String(value));
        return 1;
    }

    async hgetall(key) {
        if (this._isExpired(key)) return null;
        const hash = this._hashes.get(key);
        if (!hash || hash.size === 0) return null;
        return Object.fromEntries(hash);
    }

    async hdel(key, ...fields) {
        const hash = this._hashes.get(key);
        if (!hash) return 0;
        let count = 0;
        for (const f of fields) { if (hash.delete(f)) count++; }
        return count;
    }

    async incr(key) {
        const val = parseInt(await this.get(key) || '0', 10);
        const next = val + 1;
        await this.set(key, next);
        return next;
    }

    async flush() {
        this._store.clear();
        this._expiries.clear();
        this._hashes.clear();
        return 'OK';
    }

    async ping() { return 'PONG'; }
}

class CacheClient {
    constructor() {
        this._useRedis = false;
        this._client   = null;
        this._fallback = new InMemoryStore();
        this._init();
    }

    _init() {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) return; // no Redis URL → stay in-memory

        try {
            // Attempt to load ioredis (preferred) or redis v4+
            let Redis;
            try { Redis = require('ioredis'); } catch {
                try { Redis = require('redis'); } catch { return; }
            }

            if (Redis.createClient) {
                // redis v4 style
                this._client = Redis.createClient({ url: redisUrl });
                this._client.on('error', (err) => {
                    if (this._useRedis) {
                        console.warn('[cache] Redis error, falling back to in-memory:', err.message);
                        this._useRedis = false;
                    }
                });
                this._client.connect()
                    .then(() => { this._useRedis = true; console.info('[cache] Connected to Redis'); })
                    .catch(err => { console.warn('[cache] Redis connect failed:', err.message); });
            } else {
                // ioredis style
                this._client = new Redis(redisUrl);
                this._client.on('ready', () => { this._useRedis = true; console.info('[cache] Connected to Redis'); });
                this._client.on('error', (err) => {
                    if (this._useRedis) {
                        console.warn('[cache] Redis error, falling back to in-memory:', err.message);
                        this._useRedis = false;
                    }
                });
            }
        } catch (err) {
            console.warn('[cache] Redis library not found, using in-memory store:', err.message);
        }
    }

    _store() { return this._useRedis ? this._client : this._fallback; }

    async get(key) {
        try { return await this._store().get(key); }
        catch { return this._fallback.get(key); }
    }

    async set(key, value, ttlSeconds) {
        try {
            if (this._useRedis && ttlSeconds !== null && ttlSeconds !== undefined) {
                // redis v4: set with EX option; ioredis: setex
                if (this._client.setEx) return await this._client.setEx(key, ttlSeconds, String(value));
                if (this._client.setex) return await this._client.setex(key, ttlSeconds, String(value));
                return await this._client.set(key, String(value), 'EX', ttlSeconds);
            }
            return await this._store().set(key, value, ttlSeconds);
        } catch { return this._fallback.set(key, value, ttlSeconds); }
    }

    async del(...keys) {
        try { return await this._store().del(...keys); }
        catch { return this._fallback.del(...keys); }
    }

    async expire(key, ttlSeconds) {
        try { return await this._store().expire(key, ttlSeconds); }
        catch { return this._fallback.expire(key, ttlSeconds); }
    }

    async hget(key, field) {
        try { return await this._store().hget(key, field); }
        catch { return this._fallback.hget(key, field); }
    }

    async hset(key, field, value) {
        try { return await this._store().hset(key, field, value); }
        catch { return this._fallback.hset(key, field, value); }
    }

    async hgetall(key) {
        try { return await this._store().hgetall(key); }
        catch { return this._fallback.hgetall(key); }
    }

    async hdel(key, ...fields) {
        try { return await this._store().hdel(key, ...fields); }
        catch { return this._fallback.hdel(key, ...fields); }
    }

    async incr(key) {
        try { return await this._store().incr(key); }
        catch { return this._fallback.incr(key); }
    }

    async flush() {
        try { return await this._store().flush(); }
        catch { return this._fallback.flush(); }
    }

    async ping() {
        try { return await this._store().ping(); }
        catch { return this._fallback.ping(); }
    }

    get isRedis() { return this._useRedis; }
}

module.exports = new CacheClient();
