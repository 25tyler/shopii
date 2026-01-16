// Mock Redis for development without Redis server
// Uses in-memory storage

interface RateLimitEntry {
  timestamps: number[];
}

class MockRedis {
  private data: Map<string, RateLimitEntry> = new Map();
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
    console.log('Mock Redis: Connected (in-memory)');
  }

  async quit(): Promise<void> {
    this.connected = false;
    this.data.clear();
    console.log('Mock Redis: Disconnected');
  }

  on(_event: string, _callback: (...args: unknown[]) => void): this {
    return this;
  }

  // Mock multi/exec for rate limiting
  multi(): MockMulti {
    return new MockMulti(this.data);
  }
}

class MockMulti {
  private operations: Array<() => unknown> = [];

  constructor(private data: Map<string, RateLimitEntry>) {}

  zremrangebyscore(key: string, _min: number, max: number): this {
    this.operations.push(() => {
      const entry = this.data.get(key);
      if (entry) {
        entry.timestamps = entry.timestamps.filter((ts) => ts > max);
      }
      return 0;
    });
    return this;
  }

  zadd(key: string, score: number, _member: string): this {
    this.operations.push(() => {
      let entry = this.data.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        this.data.set(key, entry);
      }
      entry.timestamps.push(score);
      return 1;
    });
    return this;
  }

  zcard(key: string): this {
    this.operations.push(() => {
      const entry = this.data.get(key);
      return entry?.timestamps.length || 0;
    });
    return this;
  }

  expire(_key: string, _seconds: number): this {
    this.operations.push(() => 1);
    return this;
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    return this.operations.map((op) => [null, op()]);
  }
}

export const redis = new MockRedis();

// Rate limiting helper - matches the real implementation
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zadd(key, now, `${now}-${Math.random()}`);
  multi.zcard(key);
  multi.expire(key, windowSeconds);

  const results = await multi.exec();
  const count = (results?.[2]?.[1] as number) || 0;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowSeconds,
  };
}
