/**
 * Diagnostics for the CLS API: (1) readable 400 "Constraint Violation" errors, (2) OpenAPI discovery + request-schema summary.
 * The CLS gateway answers validation errors in this shape (looks like a Java/Quarkus service):
 *   {"title":"Constraint Violation","status":400,"violations":[{"field":"retrieveBulkMessages.arg1.pagin…","message":"…"}]}
 *  - "retrieveBulkMessages" = server operation, "arg1" = the REQUEST BODY, the last part = the offending property.
 * The UI used to cut the text after ~100 characters, hiding the property name and the rule. Always show the whole thing.
 */
export interface Violation { field: string; message?: string; operation?: string; param?: string; property?: string }
export interface ParsedViolation { title?: string; status?: number; violations: Violation[] }

export function parseConstraintViolation(bodyText: string): ParsedViolation | null {
  let j: any;
  try { j = JSON.parse(bodyText); } catch { return null; }
  if (!j || !Array.isArray(j.violations)) return null;
  const violations: Violation[] = j.violations.map((v: any) => {
    const field = String(v.field ?? '');
    const [operation, param, ...rest] = field.split('.');
    return { field, message: v.message, operation, param, property: rest.join('.') || undefined };
  });
  return { title: j.title, status: j.status, violations };
}

export function describeViolations(p: ParsedViolation): string[] {
  return p.violations.map((v) =>
    `${v.operation ?? '?'}: request ${v.param === 'arg1' || v.param === 'arg0' ? 'body' : `parameter "${v.param}"`} property "${v.property ?? '?'}" ${v.message ? `— ${v.message}` : '(no message)'}`);
}

/* ---------------------------------- OpenAPI discovery ---------------------------------- */
export const OPENAPI_CANDIDATES = [
  '/telemetry/api/v1/openapi', '/telemetry/api/v1/openapi.json', '/telemetry/api/v1/q/openapi', '/telemetry/api/v1/swagger.json',
  '/telemetry/api/v1/v3/api-docs', '/telemetry/api/openapi', '/telemetry/openapi', '/q/openapi', '/openapi', '/swagger.json',
];

export interface ProbeResult { path: string; status: number | 'error'; contentType?: string; isOpenApi: boolean }
/** Read-only GET probes (status + content-type only). Run server-side with the existing token. */
export async function probeOpenApi(baseUrl: string, getToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): Promise<{ results: ProbeResult[]; spec?: any; specPath?: string }> {
  const results: ProbeResult[] = []; let spec: any; let specPath: string | undefined;
  for (const p of OPENAPI_CANDIDATES) {
    try {
      const r = await fetchImpl(new URL(p, baseUrl).toString(), { headers: { Accept: 'application/json', Authorization: `Bearer ${await getToken()}` } });
      const ct = r.headers.get('content-type') ?? '';
      let ok = false;
      if (r.status === 200 && /json|yaml/i.test(ct)) {
        try { const j = JSON.parse(await r.text()); ok = !!(j.openapi || j.swagger); if (ok && !spec) { spec = j; specPath = p; } } catch { /* yaml or not json */ }
      }
      results.push({ path: p, status: r.status, contentType: ct, isOpenApi: ok });
    } catch { results.push({ path: p, status: 'error', isOpenApi: false }); }
  }
  return { results, spec, specPath };
}

export interface OperationSummary { method: string; path: string; operationId?: string; tags?: string[] }
export function summarizeOpenApi(spec: any): OperationSummary[] {
  const out: OperationSummary[] = [];
  for (const [path, item] of Object.entries<any>(spec?.paths ?? {}))
    for (const m of ['get', 'post', 'put', 'patch', 'delete'])
      if (item?.[m]) out.push({ method: m.toUpperCase(), path, operationId: item[m].operationId, tags: item[m].tags });
  return out;
}

const deref = (spec: any, s: any): any => {
  if (s?.$ref) { const parts = String(s.$ref).replace(/^#\//, '').split('/'); return deref(spec, parts.reduce((o: any, k) => o?.[k], spec)); }
  return s;
};
export interface FieldRule { name: string; type?: string; required: boolean; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; enum?: unknown[]; format?: string }
/** Request-body fields (flattened one level for nested objects) with their constraints, for one operationId. */
export function requestSchemaFor(spec: any, operationId: string): FieldRule[] | null {
  for (const item of Object.values<any>(spec?.paths ?? {})) for (const op of Object.values<any>(item)) {
    if (op?.operationId !== operationId) continue;
    const schema = deref(spec, op.requestBody?.content?.['application/json']?.schema);
    if (!schema) return [];
    const rules: FieldRule[] = [];
    const walk = (s: any, prefix: string) => {
      s = deref(spec, s); const req: string[] = s?.required ?? [];
      for (const [k, v0] of Object.entries<any>(s?.properties ?? {})) {
        const v = deref(spec, v0); const name = prefix ? `${prefix}.${k}` : k;
        if (v?.type === 'object' && v.properties) walk(v, name);
        else rules.push({ name, type: v?.type, required: req.includes(k), minimum: v?.minimum, maximum: v?.maximum, minLength: v?.minLength, maxLength: v?.maxLength, enum: v?.enum, format: v?.format });
      }
    };
    walk(schema, ''); return rules;
  }
  return null;
}
