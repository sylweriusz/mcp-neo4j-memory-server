import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger, Logger, LogLevel, NullLogger, stringToLogLevel } from '../src/logger';

describe('Logger', () => {
  describe('NullLogger', () => {
    it('should not throw errors when methods are called', () => {
      const logger = new NullLogger();
      expect(() => logger.debug('debug message')).not.toThrow();
      expect(() => logger.info('info message')).not.toThrow();
      expect(() => logger.warn('warn message')).not.toThrow();
      expect(() => logger.error('error message')).not.toThrow();
      expect(() => logger.setLevel(LogLevel.DEBUG)).not.toThrow();
    });
  });

  describe('ConsoleLogger', () => {
    let logger: ConsoleLogger;
    let consoleDebugSpy: any;
    let consoleInfoSpy: any;
    let consoleWarnSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
      logger = new ConsoleLogger();
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should log at INFO level by default', () => {
      const message = 'test message';
      const payload = { test: 'data' };
      
      logger.debug(message, payload);
      logger.info(message, payload);
      logger.warn(message, payload);
      logger.error(message, payload);

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalledWith(message, payload);
      expect(consoleWarnSpy).toHaveBeenCalledWith(message, payload);
      expect(consoleErrorSpy).toHaveBeenCalledWith(message, payload);
    });

    it('should respect log level settings', () => {
      const message = 'test message';
      
      // Set to ERROR level
      logger.setLevel(LogLevel.ERROR);
      
      logger.debug(message);
      logger.info(message);
      logger.warn(message);
      logger.error(message);

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(message, undefined);
      
      vi.clearAllMocks();
      
      // Set to DEBUG level
      logger.setLevel(LogLevel.DEBUG);
      
      logger.debug(message);
      logger.info(message);
      logger.warn(message);
      logger.error(message);

      expect(consoleDebugSpy).toHaveBeenCalledWith(message, undefined);
      expect(consoleInfoSpy).toHaveBeenCalledWith(message, undefined);
      expect(consoleWarnSpy).toHaveBeenCalledWith(message, undefined);
      expect(consoleErrorSpy).toHaveBeenCalledWith(message, undefined);
    });
  });

  describe('stringToLogLevel', () => {
    it('should convert string to correct LogLevel', () => {
      expect(stringToLogLevel('debug')).toBe(LogLevel.DEBUG);
      expect(stringToLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
      expect(stringToLogLevel('info')).toBe(LogLevel.INFO);
      expect(stringToLogLevel('INFO')).toBe(LogLevel.INFO);
      expect(stringToLogLevel('warn')).toBe(LogLevel.WARN);
      expect(stringToLogLevel('WARN')).toBe(LogLevel.WARN);
      expect(stringToLogLevel('warning')).toBe(LogLevel.WARN);
      expect(stringToLogLevel('WARNING')).toBe(LogLevel.WARN);
      expect(stringToLogLevel('error')).toBe(LogLevel.ERROR);
      expect(stringToLogLevel('ERROR')).toBe(LogLevel.ERROR);
    });

    it('should return INFO level for unknown strings', () => {
      expect(stringToLogLevel('unknown')).toBe(LogLevel.INFO);
      expect(stringToLogLevel('')).toBe(LogLevel.INFO);
    });
  });
});
