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

describe("SessionPool Unit Tests", () => {
  describe("Enhanced Metrics", () => {
    test("should have totalCount, idleCount, activeCount, waitingCount getters", () => {
      const pool = new SessionPool({
        host: "localhost",
        port: 6667,
        maxPoolSize: 5,
        minPoolSize: 1,
      });

      // Before init, these should be accessible and return 0
      expect(pool.totalCount).toBe(0);
      expect(pool.idleCount).toBe(0);
      expect(pool.activeCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
    });

    test("getPoolStats should return comprehensive statistics", () => {
      const pool = new SessionPool({
        host: "localhost",
        port: 6667,
        maxPoolSize: 5,
        minPoolSize: 1,
      });

      const stats = pool.getPoolStats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("idle");
      expect(stats).toHaveProperty("active");
      expect(stats).toHaveProperty("waiting");
      expect(stats).toHaveProperty("endpoints");
      expect(stats).toHaveProperty("redirectCacheSize");
      
      // Verify types and initial values (before init)
      expect(typeof stats.total).toBe("number");
      expect(typeof stats.idle).toBe("number");
      expect(typeof stats.active).toBe("number");
      expect(typeof stats.waiting).toBe("number");
      expect(typeof stats.endpoints).toBe("number");
      
      // Before init, pool should be empty
      expect(stats.total).toBe(0);
      expect(stats.idle).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.waiting).toBe(0);
      expect(stats.endpoints).toBe(1); // 1 endpoint configured
    });

    test("should maintain backward compatibility with old methods", () => {
      const pool = new SessionPool({
        host: "localhost",
        port: 6667,
        maxPoolSize: 5,
        minPoolSize: 1,
      });

      // Old methods should still work
      expect(pool.getPoolSize()).toBe(0);
      expect(pool.getAvailableSize()).toBe(0);
      expect(pool.getInUseSize()).toBe(0);

      // New getters should match old methods
      expect(pool.totalCount).toBe(pool.getPoolSize());
      expect(pool.idleCount).toBe(pool.getAvailableSize());
      expect(pool.activeCount).toBe(pool.getInUseSize());
    });
  });

  describe("Queue Configuration", () => {
    test("should accept waitTimeout configuration", () => {
      const pool = new SessionPool({
        host: "localhost",
        port: 6667,
        maxPoolSize: 5,
        minPoolSize: 1,
        waitTimeout: 5000,
      });

      expect(pool).toBeDefined();
    });
  });

  describe("Constructor Backward Compatibility", () => {
    test("should support old constructor format (host, port, config)", () => {
      const pool = new SessionPool("localhost", 6667, {
        maxPoolSize: 5,
        minPoolSize: 1,
      });

      expect(pool).toBeDefined();
      expect(pool.getPoolSize()).toBe(0);
    });

    test("should support new constructor format (config object)", () => {
      const pool = new SessionPool({
        host: "localhost",
        port: 6667,
        maxPoolSize: 5,
        minPoolSize: 1,
      });

      expect(pool).toBeDefined();
      expect(pool.getPoolSize()).toBe(0);
    });

    test("should support nodeUrls format", () => {
      const pool = new SessionPool({
        nodeUrls: ["localhost:6667", "localhost:6668"],
        maxPoolSize: 5,
        minPoolSize: 1,
      });

      expect(pool).toBeDefined();
      const stats = pool.getPoolStats();
      expect(stats.endpoints).toBe(2);
    });
  });
});
