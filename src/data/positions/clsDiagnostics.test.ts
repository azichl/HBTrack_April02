import { describe, it, expect } from 'vitest';
import { parseConstraintViolation, describeViolations, probeOpenApi, summarizeOpenApi, requestSchemaFor } from './clsDiagnostics';

const body = '{"title":"Constraint Violation","status":400,"violations":[{"field":"retrieveBulkMessages.arg1.paginationLimit","message":"must be less than or equal to 100"}]}';
describe('Constraint Violation', () => {
  it('parses the exact shape seen in the log and names operation, body and property', () => {
    const p = parseConstraintViolation(body)!;
    expect(p.status).toBe(400);
    expect(p.violations[0]).toMatchObject({ operation: 'retrieveBulkMessages', param: 'arg1', property: 'paginationLimit' });
    expect(describeViolations(p)[0]).toContain('request body property "paginationLimit"');
  });
  it('returns null for HTML or other bodies', () => {
    expect(parseConstraintViolation('<html>Resource not found</html>')).toBeNull();
  });
});

const spec = { openapi: '3.0.1', paths: { '/telemetry/api/v1/messages/bulk': { post: { operationId: 'retrieveBulkMessages', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Req' } } } } } } },
  components: { schemas: { Req: { required: ['from', 'to'], properties: { from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' }, pagination: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 }, cursor: { type: 'string' } } } } } } } };
describe('OpenAPI helpers', () => {
  it('lists operations and flattens request constraints', () => {
    expect(summarizeOpenApi(spec)[0]).toMatchObject({ method: 'POST', operationId: 'retrieveBulkMessages' });
    const r = requestSchemaFor(spec, 'retrieveBulkMessages')!;
    expect(r.find((x) => x.name === 'pagination.limit')).toMatchObject({ minimum: 1, maximum: 100 });
    expect(r.find((x) => x.name === 'from')!.required).toBe(true);
  });
  it('probe records statuses and returns the first real spec', async () => {
    const f = (async (u: any) => String(u).endsWith('/q/openapi') && !String(u).includes('/telemetry/api/v1/q/')
      ? ({ status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(spec) })
      : ({ status: 404, headers: { get: () => 'text/html' }, text: async () => '<html>nf</html>' })) as any;
    const r = await probeOpenApi('https://example.invalid', async () => 't', f);
    expect(r.spec).toBeTruthy(); expect(r.specPath).toBe('/q/openapi');
    expect(r.results.filter((x) => x.status === 404).length).toBeGreaterThan(5);
  });
});
