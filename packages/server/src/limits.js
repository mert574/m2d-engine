/**
 * Rate limits: a token bucket, and a table of them keyed by something
 * (an address) that forgets idle keys so it cannot grow without bound.
 */

export class TokenBucket {
  /**
   * @param {number} rate - Tokens per second
   * @param {number} burst - Most tokens held
   * @param {number} [now] - In ms
   */
  constructor(rate, burst, now = Date.now()) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = now;
  }

  /** Take one token. False when there is none. */
  take(now = Date.now()) {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export class KeyedLimiter {
  /**
   * @param {number} rate - Per key, per second
   * @param {number} burst - Per key
   * @param {number} [maxKeys=100000] - Keys tracked at once. Past it, unknown keys are refused
   */
  constructor(rate, burst, maxKeys = 100000) {
    this.rate = rate;
    this.burst = burst;
    this.maxKeys = maxKeys;
    this.buckets = new Map();
  }

  take(key, now = Date.now()) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) this.#sweep(now);
      if (this.buckets.size >= this.maxKeys) return false;
      bucket = new TokenBucket(this.rate, this.burst, now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(now);
  }

  /** Forget keys whose buckets have refilled: they are indistinguishable from new ones. */
  #sweep(now) {
    const full = (this.burst / this.rate) * 1000;
    for (const [key, bucket] of this.buckets) if (now - bucket.at >= full) this.buckets.delete(key);
  }
}
