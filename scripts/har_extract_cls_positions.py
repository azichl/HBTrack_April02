#!/usr/bin/env python3
"""
Find the REAL CLS "Positions" request in a browser HAR and write a config for clsApiClient.ts. No URL is guessed.

How to capture the HAR (2 minutes):
  1. Open the CLS web app (Environmental Monitoring) in Chrome and sign in.
  2. DevTools > Network > tick "Preserve log" > clear.
  3. Open the Positions tab; set a date range and Device ID; scroll/click to load page 2 if there is paging.
  4. Right-click the request list > "Save all as HAR with content".
  5. python har_extract_cls_positions.py capture.har  [--device 43571]

Secrets (Authorization, Cookie, tokens) are never written to the output.
"""
import json, re, sys, argparse
from urllib.parse import urlparse, parse_qsl

LAT = {'lat', 'latitude', 'y'}; LON = {'lon', 'lng', 'long', 'longitude', 'x'}
DATE = {'locationdate', 'locdate', 'date', 'positiondate', 'time', 'datelocation'}
norm = lambda k: re.sub(r'[^a-z0-9]', '', k.lower())
SECRET_HDR = {'authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization'}
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$')

def find_rows(obj, path=''):
    """Return (path, rows) for the largest list of dicts that looks like positions."""
    best = (None, [], 0)
    def score(rows):
        if not rows or not isinstance(rows[0], dict): return 0
        keys = {norm(k) for k in rows[0]}
        return (2 if keys & {norm(x) for x in LAT} else 0) + (2 if keys & {norm(x) for x in LON} else 0) + (1 if keys & DATE else 0) + min(len(rows), 50) / 50
    def walk(o, p):
        nonlocal best
        if isinstance(o, list):
            s = score(o)
            if s > best[2]: best = (p, o, s)
        elif isinstance(o, dict):
            for k, v in o.items(): walk(v, f'{p}.{k}' if p else k)
    walk(obj, path); return best

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('har'); ap.add_argument('--device'); ap.add_argument('--out', default='cls_positions_endpoint.config.json')
    a = ap.parse_args()
    har = json.load(open(a.har, encoding='utf-8'))
    cands = []
    for e in har['log']['entries']:
        req, res = e['request'], e['response']
        txt = res.get('content', {}).get('text')
        if not txt or 'json' not in (res.get('content', {}).get('mimeType') or '').lower(): continue
        try: body = json.loads(txt)
        except Exception: continue
        rp, rows, sc = find_rows(body)
        if sc < 4: continue
        url = urlparse(req['url']); bonus = 2 if 'position' in url.path.lower() else 0
        cands.append((sc + bonus, e, rp, rows, body))
    if not cands:
        sys.exit('No JSON response with latitude/longitude/date rows found. Make sure you opened the Positions tab with "Preserve log" on and saved WITH content.')
    cands.sort(key=lambda c: -c[0])
    sc, e, rp, rows, body = cands[0]
    req = e['request']; u = urlparse(req['url'])
    q = dict(parse_qsl(u.query, keep_blank_values=True))
    post = None
    if req.get('postData', {}).get('text'):
        try: post = json.loads(req['postData']['text'])
        except Exception: post = None
    # detect date params (two ISO-like values / epoch) and device param
    tmpl_q, isos = {}, []
    for k, v in q.items():
        if ISO.match(v) or re.fullmatch(r'\d{10,13}', v): isos.append(k)
    dev_param = next((k for k, v in q.items() if (a.device and a.device in v.split(',')) or re.fullmatch(r'\d{4,6}(,\d{4,6})*', v)), None)
    for k, v in q.items():
        tmpl_q[k] = v
    if dev_param: tmpl_q[dev_param] = '{deviceIds}'
    for k in q:
        if norm(k) in ('type', 'locationtype', 'loctype', 'positiontype'): tmpl_q[k] = '{type}'
    if len(isos) >= 2:
        s = sorted(isos, key=lambda k: q[k]); tmpl_q[s[0]] = '{from}'; tmpl_q[s[1]] = '{to}'
    pag = {'kind': 'none', 'pageSize': len(rows)}
    keys = {k.lower(): k for k in q}
    for pk in ('page', 'pagenumber', 'pageindex'):
        if pk in keys: pag = {'kind': 'page', 'pageParam': keys[pk], 'startPage': int(q[keys[pk]]) if q[keys[pk]].isdigit() else 1, 'pageSize': len(rows)}; tmpl_q[keys[pk]] = '{page}'
    for sk in ('size', 'pagesize', 'limit', 'per_page', 'take'):
        if sk in keys and pag['kind'] in ('page', 'none'): pag['sizeParam'] = keys[sk]; pag['pageSize'] = int(q[keys[sk]]) if q[keys[sk]].isdigit() else pag['pageSize']; tmpl_q[keys[sk]] = '{pageSize}'
    for ck in ('cursor', 'continuationtoken', 'next', 'after'):
        if ck in keys: pag = {'kind': 'cursor', 'cursorParam': keys[ck], 'pageSize': len(rows), 'nextCursorPath': 'next'}; tmpl_q[keys[ck]] = '{cursor}'
    if 'offset' in keys or 'skip' in keys:
        ok = keys.get('offset') or keys.get('skip'); pag = {'kind': 'offset', 'offsetParam': ok, 'pageSize': len(rows)}; tmpl_q[ok] = '{offset}'
    hdr = {h['name']: h['value'] for h in req['headers'] if h['name'].lower() not in SECRET_HDR and not h['name'].startswith(':') and h['name'].lower() in ('accept', 'content-type', 'accept-language', 'x-requested-with')}
    sample = [rows[0]] if rows else []
    sample_keys = list(rows[0].keys()) if rows else []
    meta_keys = [k for k in (body.keys() if isinstance(body, dict) else []) if k != rp.split('.')[0]]
    cfg = {
        '_review': 'GENERATED — check every field. Date format/device format/type map are guesses from one request.',
        'baseUrl': f'{u.scheme}://{u.netloc}', 'path': u.path, 'method': req['method'],
        'query': tmpl_q, 'body': post, 'headers': hdr,
        'dateFormat': 'iso-seconds', 'deviceIdsFormat': 'csv', 'deviceIdsParam': dev_param,
        'typeMap': {'ALL': None, 'GPS': 'GPS', 'DOPPLER': 'DOPPLER'},
        'pagination': pag, 'rowsPath': rp or '', 'maxWindowDays': 31, 'maxDevicesPerCall': 50,
        '_observed': {'status': e['response']['status'], 'rowsInResponse': len(rows), 'rowKeys': sample_keys, 'otherResponseKeys': meta_keys, 'dateParams': isos, 'candidateScore': round(sc, 2)},
    }
    json.dump(cfg, open(a.out, 'w'), indent=2)
    json.dump(sample, open('cls_positions_sample_row.json', 'w'), indent=2)
    print(f"Endpoint : {req['method']} {u.scheme}://{u.netloc}{u.path}")
    print(f"Query    : {q}")
    print(f"rowsPath : {rp!r}   rows in response: {len(rows)}   row keys: {sample_keys}")
    print(f"Paging   : {pag}")
    print(f"Wrote {a.out} and cls_positions_sample_row.json (no secrets).")
    others = [(c[0], c[1]['request']['url']) for c in cands[1:4]]
    if others: print('Other candidates:', others)

main()
