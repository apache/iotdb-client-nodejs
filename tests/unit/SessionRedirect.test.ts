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

import { Session } from "../../src/client/Session";

function newSession(): Session {
  return new Session({
    host: "localhost",
    port: 6667,
    username: "root",
    password: "root",
  });
}

// getAndClearLastRedirect is the single consumption point for the redirect
// endpoint the server advertises (Session.lastRedirectEndpoint), before the
// pool caches and connects to it — so the wildcard guard is exercised here.
describe("Session.getAndClearLastRedirect", () => {
  test("returns a normal redirect endpoint and clears it", () => {
    const session = newSession();
    (session as any).lastRedirectEndpoint = { host: "10.0.0.9", port: 6667 };

    expect(session.getAndClearLastRedirect()).toEqual({
      host: "10.0.0.9",
      port: 6667,
    });
    // Cleared after reading.
    expect(session.getAndClearLastRedirect()).toBeNull();
  });

  test("ignores a redirect to a wildcard/listen-all address", () => {
    for (const host of ["0.0.0.0", "::"]) {
      const session = newSession();
      (session as any).lastRedirectEndpoint = { host, port: 6667 };

      expect(session.getAndClearLastRedirect()).toBeNull();
    }
  });
});
