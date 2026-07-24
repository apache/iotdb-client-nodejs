/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { SessionPool } from "../../src/client/SessionPool";

/**
 * Test pool that hands out lightweight fake sessions (no real IoTDB
 * connection) so getSession()/releaseSession() lifecycle bookkeeping can be
 * exercised deterministically. `createGate`, when set, lets a test hold a
 * createSession() call open to interleave a concurrent release.
 */
class TestPool extends SessionPool {
  public createGate: Promise<void> | null = null;
  private counter = 0;

  protected async createPoolSession(): Promise<any> {
    if (this.createGate) {
      await this.createGate;
    }
    const id = ++this.counter;
    const session: any = {
      id,
      _closed: false,
      // When set to a promise, close() parks on it while isOpen() keeps
      // returning true — lets a test hold a close open to probe TOCTOU.
      closeGate: null as Promise<void> | null,
      isOpen: () => !session._closed,
      close: async () => {
        if (session.closeGate) {
          await session.closeGate;
        }
        session._closed = true;
      },
    };
    return session;
  }

  pooledFor(session: any): any {
    return (this as any).pool.find((ps: any) => ps.session === session);
  }
  runCleanup(): Promise<void> {
    return (this as any).cleanupIdleSessions();
  }

  idleSessionObjects(): any[] {
    return (this as any).idleSessions.toArray().map((ps: any) => ps.session);
  }
  activeSessionObjects(): any[] {
    return Array.from((this as any).activeSessions as Set<any>).map(
      (ps: any) => ps.session,
    );
  }
}

function newPool(overrides: Record<string, unknown>): TestPool {
  return new TestPool({
    host: "localhost",
    port: 6667,
    minPoolSize: 0,
    ...overrides,
  } as any);
}

describe("BaseSessionPool lifecycle", () => {
  it("does not leak a released session to a timed-out waiter (no starvation)", async () => {
    const pool = newPool({ maxPoolSize: 1, waitTimeout: 50 });

    const s1 = await pool.getSession(); // creates S1; pool is now full (1/1)

    // Pool is full, so this acquisition waits and then times out.
    await expect(pool.getSession()).rejects.toThrow(/Timeout/);

    // Releasing S1 must return it to the pool, not hand it to the dead waiter
    // (which would mark S1 active-but-held-by-nobody and starve the pool).
    pool.releaseSession(s1);

    // S1 must be acquirable again. On the buggy code this getSession() starves
    // and rejects with a timeout.
    const s2 = await pool.getSession();
    expect(s2).toBe(s1);

    await pool.close();
  });

  it("create-branch removes the new session, not a concurrently-released idle one", async () => {
    const pool = newPool({ maxPoolSize: 3, waitTimeout: 1000 });

    const s1 = await pool.getSession(); // create S1; active, idle=[]

    // Hold the next createSession() open so we can release S1 mid-flight.
    let openGate!: () => void;
    pool.createGate = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    const acquireA = pool.getSession(); // enters create-branch, awaits the gate
    // One yield is enough: getSession() runs synchronously up to the first
    // await (the createSession call), so after this tick acquireA is parked on
    // the gate and the release below interleaves before it resumes.
    await new Promise((r) => setImmediate(r));

    // Concurrent release pushes S1 to the FRONT of idle while A is awaiting.
    pool.releaseSession(s1); // idle=[S1]

    openGate(); // A's createSession resolves -> pushes S2 -> idle=[S1,S2]
    const s2 = await acquireA;

    expect(s2).not.toBe(s1);
    // S1 must remain the idle session; S2 was handed to A and must not also
    // linger in idle (the blind shift() bug evicted S1 and left S2 in idle).
    expect(pool.idleSessionObjects()).toContain(s1);
    expect(pool.idleSessionObjects()).not.toContain(s2);
    expect(pool.activeSessionObjects()).toContain(s2);

    await pool.close();
  });

  it("marks a reused idle session as inUse", async () => {
    const pool = newPool({ maxPoolSize: 2 });

    const s1 = await pool.getSession();
    pool.releaseSession(s1); // back to idle, inUse=false
    const s2 = await pool.getSession(); // idle-reuse branch

    expect(s2).toBe(s1);
    // The reused session is handed to a caller, so it must be inUse; the
    // idle-reuse branch used to skip this, leaving it false while active.
    expect(pool.pooledFor(s2).inUse).toBe(true);

    await pool.close();
  });

  it("cleanupIdleSessions never shrinks the pool below minPoolSize", async () => {
    const pool = newPool({ maxPoolSize: 5, minPoolSize: 1, maxIdleTime: 1 });

    const a = await pool.getSession();
    const b = await pool.getSession();
    const c = await pool.getSession();
    pool.releaseSession(a);
    pool.releaseSession(b);
    pool.releaseSession(c);
    // Make every session look long-idle so all three qualify for cleanup.
    for (const ps of (pool as any).pool) {
      ps.lastUsed = 0;
    }

    await pool.runCleanup();

    // Must retain minPoolSize; the buggy guard (constant pre-cleanup size)
    // removed all three and collapsed the pool to 0.
    expect(pool.getPoolSize()).toBe(1);

    await pool.close();
  });

  it("cleanupIdleSessions does not hand out a session that is being closed", async () => {
    // minPoolSize=1 (0 would coerce to 1 anyway), 2 idle sessions so cleanup
    // removes exactly one (the first-queued, s1) and keeps one warm.
    const pool = newPool({ maxPoolSize: 3, minPoolSize: 1, maxIdleTime: 1 });

    const s1 = await pool.getSession();
    const s2 = await pool.getSession();
    pool.releaseSession(s1); // idle=[s1]
    pool.releaseSession(s2); // idle=[s1, s2]
    for (const ps of (pool as any).pool) {
      ps.lastUsed = 0; // both qualify as long-idle
    }

    // Gate s1's close so it stays "closing" (isOpen()===true) across an await.
    let openClose!: () => void;
    (s1 as any).closeGate = new Promise<void>((r) => {
      openClose = r;
    });

    const cleanup = pool.runCleanup(); // removes s1 (down to minSize=1), gated close
    await new Promise((r) => setImmediate(r)); // let cleanup reach the close await

    // A concurrent acquire must NOT receive the session being closed. On the
    // buggy close-then-splice, s1 stays in idle during close() and shift()
    // hands it out.
    const acquired = await pool.getSession();
    expect(acquired).not.toBe(s1);

    openClose(); // let the close finish
    await cleanup;

    await pool.close();
  });
});
