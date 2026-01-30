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

import { logger } from "./Logger";

export interface Closable {
  close(): Promise<void>;
}

export interface CleanupOptions {
  signals?: NodeJS.Signals[];
  includeBeforeExit?: boolean;
  includeUncaughtException?: boolean;
  includeUnhandledRejection?: boolean;
  timeoutMs?: number;
}

const closables = new Set<Closable>();
let cleanupInProgress: Promise<void> | null = null;

export function registerClosable(closable: Closable): void {
  closables.add(closable);
}

export function unregisterClosable(closable: Closable): void {
  closables.delete(closable);
}

async function runCleanup(timeoutMs: number): Promise<void> {
  if (!cleanupInProgress) {
    const cleanupPromise = Promise.allSettled(
      Array.from(closables).map((closable) => closable.close()),
    ).then(() => undefined);

    if (timeoutMs > 0) {
      cleanupInProgress = Promise.race([
        cleanupPromise,
        new Promise<void>((resolve) => {
          setTimeout(() => resolve(), timeoutMs);
        }),
      ]).then(() => undefined);
    } else {
      cleanupInProgress = cleanupPromise;
    }
  }

  await cleanupInProgress;
}

export function enableGlobalCleanup(options: CleanupOptions = {}): () => void {
  const {
    signals = ["SIGINT", "SIGTERM"],
    includeBeforeExit = true,
    includeUncaughtException = true,
    includeUnhandledRejection = true,
    timeoutMs = 5000,
  } = options;

  const handlers: Array<{ event: string; handler: (...args: any[]) => void }> =
    [];

  const attach = (event: string, handler: (...args: any[]) => void) => {
    process.on(event, handler);
    handlers.push({ event, handler });
  };

  if (includeBeforeExit) {
    attach("beforeExit", async () => {
      try {
        await runCleanup(timeoutMs);
      } catch (error) {
        logger.warn("Error during beforeExit cleanup:", error);
      }
    });
  }

  if (includeUnhandledRejection) {
    attach("unhandledRejection", async (reason) => {
      logger.warn("Unhandled promise rejection:", reason);
      try {
        await runCleanup(timeoutMs);
      } finally {
        process.exit(1);
      }
    });
  }

  if (includeUncaughtException) {
    attach("uncaughtException", async (error) => {
      logger.error("Uncaught exception:", error);
      try {
        await runCleanup(timeoutMs);
      } finally {
        process.exit(1);
      }
    });
  }

  for (const signal of signals) {
    attach(signal, async () => {
      try {
        await runCleanup(timeoutMs);
      } finally {
        process.exit(0);
      }
    });
  }

  return () => {
    for (const { event, handler } of handlers) {
      process.off(event, handler);
    }
  };
}
