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

import { logger, LogLevel } from '../../src/utils/Logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('Should log info messages', () => {
    logger.setLevel(LogLevel.INFO);
    logger.info('Test info message');
    expect(consoleLogSpy).toHaveBeenCalledWith('[INFO] Test info message');
  });

  test('Should log debug messages when level is DEBUG', () => {
    logger.setLevel(LogLevel.DEBUG);
    logger.debug('Test debug message');
    expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] Test debug message');
  });

  test('Should not log debug messages when level is INFO', () => {
    logger.setLevel(LogLevel.INFO);
    logger.debug('Test debug message');
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test('Should log warn messages', () => {
    logger.setLevel(LogLevel.WARN);
    logger.warn('Test warn message');
    expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] Test warn message');
  });

  test('Should log error messages', () => {
    logger.setLevel(LogLevel.ERROR);
    logger.error('Test error message');
    expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Test error message');
  });

  test('Should support additional arguments', () => {
    logger.setLevel(LogLevel.INFO);
    logger.info('Test with args', { key: 'value' }, 123);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[INFO] Test with args',
      { key: 'value' },
      123
    );
  });
});
