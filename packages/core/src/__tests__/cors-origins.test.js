import { describe, expect, it } from 'vitest';
import { buildDefaultAllowedOrigins } from '../corsOrigins';

describe('buildDefaultAllowedOrigins', () => {
    it('includes localhost dev origins', () => {
        const origins = buildDefaultAllowedOrigins();

        expect(origins).toContain('http://localhost:3001');
        expect(origins).toContain('http://localhost:3003');
    });

    it('includes 127.0.0.1 loopback dev origins', () => {
        const origins = buildDefaultAllowedOrigins();

        expect(origins).toContain('http://127.0.0.1:3001');
        expect(origins).toContain('http://127.0.0.1:3003');
    });

    it('does not generate duplicates', () => {
        const origins = buildDefaultAllowedOrigins();
        const uniqueOrigins = new Set(origins);

        expect(uniqueOrigins.size).toBe(origins.length);
    });
});
