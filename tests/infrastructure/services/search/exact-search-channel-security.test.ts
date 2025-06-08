import { ExactSearchChannel } from '../../../../src/infrastructure/services/search/exact-search-channel.js';
import { Session } from 'neo4j-driver';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ExactSearchChannel Security Tests', () => {
  let channel: ExactSearchChannel;
  let mockSession: any;

  beforeEach(() => {
    mockSession = {
      run: vi.fn().mockResolvedValue({ records: [] })
    };
    channel = new ExactSearchChannel(mockSession as Session);
  });

  describe('sanitizeLuceneQuery security through public API', () => {
    it('should escape all BASE85 special characters when searching', async () => {
      // Test with all BASE85 special characters
      const base85SpecialChars = '!#$%&()*+,-./:;=?@_{}~`';
      
      await channel.search(base85SpecialChars, 10);

      // Check both FULLTEXT queries were called with properly escaped characters
      const calls = mockSession.run.mock.calls;
      
      // Should have at least 2 calls (metadata and content FULLTEXT searches)
      expect(calls.length).toBeGreaterThanOrEqual(2);
      
      // Find the FULLTEXT query calls
      const fulltextCalls = calls.filter((call: any[]) => 
        call[0].includes('db.index.fulltext.queryNodes')
      );
      
      expect(fulltextCalls.length).toBeGreaterThanOrEqual(2);
      
      // Check each FULLTEXT call has escaped query
      fulltextCalls.forEach((call: any[]) => {
        const params = call[1];
        expect(params.query).toBeDefined();
        
        // The query should only contain alphanumeric, spaces, and escaped special chars
        // Every special char from BASE85 should be preceded by backslash
        const query = params.query;
        
        // Check that no unescaped special chars remain
        // This regex finds any special char NOT preceded by backslash
        const unescapedSpecialChars = query.match(/(?<!\\)[!#$%&()*+,\-./:;=?@_{}~`]/g);
        expect(unescapedSpecialChars).toBeNull();
      });
    });

    it('should prevent Lucene injection attacks', async () => {
      const maliciousQueries = [
        'field:value',                    // Field query injection
        'name:* OR id:*',                // OR injection
        'test"; MATCH (n) DETACH DELETE n;//', // Cypher injection attempt
        'test AND metadata:secret',       // AND injection
        'test NOT secure',                // NOT injection
        'test~0.8',                      // Fuzzy query injection
        'test^2.0',                      // Boost injection
        '[a TO z]',                      // Range query injection
        'test*',                         // Wildcard injection
        'test?',                         // Single char wildcard
      ];

      for (const malicious of maliciousQueries) {
        mockSession.run.mockClear();
        await channel.search(malicious, 10);
        
        const calls = mockSession.run.mock.calls;
        const fulltextCalls = calls.filter((call: any[]) => 
          call[0].includes('db.index.fulltext.queryNodes')
        );
        
        fulltextCalls.forEach((call: any[]) => {
          const query = call[1].query;
          
          // Verify dangerous Lucene patterns are neutralized
          expect(query).not.toMatch(/[^\\]:/); // Unescaped colon (field queries)
          expect(query).not.toContain(' OR ');   // Uppercase OR should be lowercase
          expect(query).not.toContain(' AND ');  // Uppercase AND should be lowercase
          expect(query).not.toContain(' NOT ');  // Uppercase NOT should be lowercase
          expect(query).not.toContain(' TO ');   // Uppercase TO should be lowercase
          
          // Note: MATCH and DELETE are Cypher commands, not Lucene operators
          // They're harmless in FULLTEXT context but we include them in the query
          
          // Verify operators were converted to lowercase (safe)
          if (malicious.includes(' OR ')) expect(query).toContain(' or ');
          if (malicious.includes(' AND ')) expect(query).toContain(' and ');
          if (malicious.includes(' NOT ')) expect(query).toContain(' not ');
          
          // Special Lucene operators should be escaped
          if (query.includes('~')) expect(query).toContain('\\~');
          if (query.includes('^')) expect(query).toContain('\\^');
          if (query.includes('*')) expect(query).toContain('\\*');
          if (query.includes('?')) expect(query).toContain('\\?');
          if (query.includes(':')) expect(query).toContain('\\:');
          if (query.includes('[')) expect(query).toContain('\\[');
          if (query.includes(']')) expect(query).toContain('\\]');
        });
      }
    });

    it('should not double-escape already escaped characters', async () => {
      // Test with pre-escaped query
      const preEscaped = 'test\\:value\\*end';
      
      await channel.search(preEscaped, 10);

      const calls = mockSession.run.mock.calls;
      const fulltextCalls = calls.filter((call: any[]) => 
        call[0].includes('db.index.fulltext.queryNodes')
      );
      
      fulltextCalls.forEach((call: any[]) => {
        const query = call[1].query;
        
        // Should maintain single escaping, not double
        expect(query).toContain('test\\:value\\*end');
        expect(query).not.toContain('test\\\\:'); // No double backslash
        expect(query).not.toContain('\\\\*end');
      });
    });

    it('should preserve safe alphanumeric characters and spaces', async () => {
      const safeQuery = 'Test 123 Query ABC xyz';
      
      await channel.search(safeQuery, 10);

      const calls = mockSession.run.mock.calls;
      const fulltextCalls = calls.filter((call: any[]) => 
        call[0].includes('db.index.fulltext.queryNodes')
      );
      
      fulltextCalls.forEach((call: any[]) => {
        const query = call[1].query;
        // Alphanumeric and spaces should remain unchanged
        expect(query).toBe('Test 123 Query ABC xyz');
      });
    });

    it('should handle email addresses safely', async () => {
      const email = 'user@example.com';
      
      await channel.search(email, 10);

      const calls = mockSession.run.mock.calls;
      const fulltextCalls = calls.filter((call: any[]) => 
        call[0].includes('db.index.fulltext.queryNodes')
      );
      
      fulltextCalls.forEach((call: any[]) => {
        const query = call[1].query;
        // @ and . should be escaped
        expect(query).toBe('user\\@example\\.com');
      });
    });

    it('should escape dangerous BASE85 chars that could affect Cypher', async () => {
      const dangerousInputs = [
        'test$param',      // $ - parameter injection risk
        'test;DROP',       // ; - statement separator  
        'test`template',   // ` - backtick risk
        'test=value',      // = - assignment operator
        'test#comment',    // # - comment character
      ];

      for (const input of dangerousInputs) {
        mockSession.run.mockClear();
        await channel.search(input, 10);
        
        const calls = mockSession.run.mock.calls;
        const fulltextCalls = calls.filter((call: any[]) => 
          call[0].includes('db.index.fulltext.queryNodes')
        );
        
        fulltextCalls.forEach((call: any[]) => {
          const query = call[1].query;
          
          // All special chars should be escaped
          if (input.includes('$')) expect(query).toContain('\\$');
          if (input.includes(';')) expect(query).toContain('\\;');
          if (input.includes('`')) expect(query).toContain('\\`');
          if (input.includes('=')) expect(query).toContain('\\=');
          if (input.includes('#')) expect(query).toContain('\\#');
        });
      }
    });
  });

  describe('Memory type filtering security', () => {
    it('should use parameterized queries for memory types', async () => {
      const memoryTypes = ['note', 'project'];
      
      await channel.search('test', 10, memoryTypes);

      // Verify all queries use parameters properly
      const calls = mockSession.run.mock.calls;
      
      calls.forEach((call: any[]) => {
        const query = call[0];
        const params = call[1];
        
        if (query.includes('memoryType')) {
          // Should use parameter placeholder
          expect(query).toMatch(/\$memoryTypes/);
          expect(params.memoryTypes).toEqual(memoryTypes);
          
          // Should NOT contain direct string values
          expect(query).not.toContain("'note'");
          expect(query).not.toContain("'project'");
          expect(query).not.toContain('"note"');
          expect(query).not.toContain('"project"');
        }
      });
    });

    it('should not allow SQL/Cypher injection through memory types', async () => {
      const maliciousTypes = [
        "'; DROP DATABASE neo4j; //",
        "' OR 1=1 --",
        "') OR true; MATCH (n) DELETE n; //",
      ];
      
      await channel.search('test', 10, maliciousTypes);

      const calls = mockSession.run.mock.calls;
      
      // The malicious strings should only appear in parameters, never in query
      calls.forEach((call: any[]) => {
        const query = call[0];
        const params = call[1];
        
        // Query should not contain any of the malicious strings
        maliciousTypes.forEach(malicious => {
          expect(query).not.toContain(malicious);
          expect(query).not.toContain('DROP');
          expect(query).not.toContain('DELETE');
        });
        
        // But params should contain them (safely parameterized)
        if (params.memoryTypes) {
          expect(params.memoryTypes).toEqual(maliciousTypes);
        }
      });
    });
  });
});
