import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  logAuditEvent,
  generateRequestId,
  summarizeInputForLog,
  summarizeOutputForLog,
} from '../../src/utils/audit';

describe('Audit Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateRequestId', () => {
    it('should generate unique operation IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      
      expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateRequestId();
      const after = Date.now();
      
      const timestamp = parseInt(id.split('_')[1]);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('summarizeInputForLog', () => {
    it('should summarize string input by truncating', () => {
      const longString = 'a'.repeat(300);
      const result = summarizeInputForLog(longString);
      
      expect(result.length).toBeLessThan(300);
      expect(result).toContain('...');
    });

    it('should not truncate short strings', () => {
      const shortString = 'Short input';
      const result = summarizeInputForLog(shortString);
      
      expect(result).toBe(shortString);
      expect(result).not.toContain('...');
    });

    it('should count array items without recording their values', () => {
      const input = {
        items: ['one', 'two', 'three']
      };
      const result = summarizeInputForLog(input);
      
      expect(result).toContain('arrayItemCount');
      expect(result).toContain('3');
      expect(result).not.toContain('one');
    });

    it('should count string fields', () => {
      const input = {
        label: 'sample value'
      };
      const result = summarizeInputForLog(input);
      
      expect(result).toContain('stringFieldCount');
    });

    it('should report the number of fields', () => {
      const input = {
        first: true,
        second: 2,
      };
      const result = summarizeInputForLog(input);
      
      expect(result).toContain('"fieldCount":2');
    });

    it('should handle complex objects', () => {
      const input = {
        items: ['one'],
        label: 'sample',
        enabled: true,
      };
      const result = summarizeInputForLog(input);
      
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('fieldCount', 3);
      expect(parsed).toHaveProperty('stringFieldCount', 1);
      expect(parsed).toHaveProperty('arrayItemCount', 1);
    });
  });

  describe('summarizeOutputForLog', () => {
    it('should truncate long output', () => {
      const longOutput = 'x'.repeat(600);
      const result = summarizeOutputForLog(longOutput);
      
      expect(result.length).toBeLessThan(600);
      expect(result).toContain('...');
    });

    it('should not truncate short output', () => {
      const shortOutput = 'Short response';
      const result = summarizeOutputForLog(shortOutput);
      
      expect(result).toBe(shortOutput);
    });

    it('should redact generic secret-key values', () => {
      const output = 'Key: sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz';
      const result = summarizeOutputForLog(output);
      
      expect(result).toContain('[KEY_REDACTED]');
      expect(result).not.toContain('sk-abc123');
    });

    it('should redact Anthropic API keys', () => {
      const output = 'Key: sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu';
      const result = summarizeOutputForLog(output);
      
      expect(result).toContain('[KEY_REDACTED]');
      expect(result).not.toContain('sk-ant-api03');
    });

    it('should redact API key assignments', () => {
      const output = 'apikey: "secret-value-here"';
      const result = summarizeOutputForLog(output);
      
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('secret-value');
    });

    it('should handle empty output', () => {
      const result = summarizeOutputForLog('');
      expect(result).toBe('');
    });
  });

  describe('logAuditEvent', () => {
    it('should log audit entry to console', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logAuditEvent({
        timestamp: '2026-05-11T10:00:00.000Z',
        requestId: 'req_123_abc',
        toolName: 'sample-tool',
        provider: 'sample-provider',
        model: 'sample-model',
        inputSummary: '{"fileCount":2}',
        outputSummary: 'completed',
        suspiciousInputDetected: false,
        outputValidated: true,
        durationMs: 1234,
      });
      
      expect(consoleSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(
        consoleSpy.mock.calls[0][0].replace('[AUDIT] ', '')
      );
      
      expect(loggedData).toMatchObject({
        level: 'audit',
        service: 'mcp-tool-control',
        toolName: 'sample-tool',
        provider: 'sample-provider',
        suspiciousInputDetected: false,
        outputValidated: true,
      });
      
      consoleSpy.mockRestore();
    });

    it('should include all required fields', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const entry = {
        timestamp: '2026-05-11T10:00:00.000Z',
        requestId: 'req_123_abc',
        toolName: 'sample-tool',
        provider: 'sample-provider',
        model: 'sample-model',
        inputSummary: 'test',
        outputSummary: 'test',
        suspiciousInputDetected: true,
        outputValidated: true,
        durationMs: 500,
      };
      
      logAuditEvent(entry);
      
      const loggedData = JSON.parse(
        consoleSpy.mock.calls[0][0].replace('[AUDIT] ', '')
      );
      
      expect(loggedData).toHaveProperty('timestamp');
      expect(loggedData).toHaveProperty('requestId');
      expect(loggedData).toHaveProperty('toolName');
      expect(loggedData).toHaveProperty('provider');
      expect(loggedData).toHaveProperty('model');
      expect(loggedData).toHaveProperty('durationMs');
      
      consoleSpy.mockRestore();
    });
  });
});
