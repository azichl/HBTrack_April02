# Step 2 Dry-Run Migration Report

**Date:** 2026-10-15T08:05:56.249Z  
**Database:** `trackapp-v2` (`transmitters` collection)  
**Strict ID Guard:** `^\d{3,10}$`

## Summary Counts

| Metric | Count | Details |
| :--- | :--- | :--- |
| **Total Scanned Documents** | **131** | Current count in `transmitters` |
| **Existing Canonical Docs** | **32** | Docs with clean numeric IDs |
| **Legacy Prefixed Docs** | **98** | Docs with `trans-*` prefix |
| **Malformed Docs** | **1** | Docs failing `^\d{3,10}$` (`trans-`) |
| **Docs to be Merged** | **32** | Legacy docs whose canonical counterpart exists |
| **Docs to be Created** | **66** | PTTs existing only with `trans-*` prefix |
| **Docs to be Deleted** | **99** | 98 legacy `trans-*` + 1 malformed |
| **Target Clean Inventory** | **98** | Exactly 98 canonical PTT documents |

## 1. Merges Planned (32 Docs)
These documents exist in both formats. Field union rules preserve newer fix times, coordinates, bird linkages, and human manual status overrides:
```
PTT 242080: fields merged -> [already in sync]
PTT 242081: fields merged -> [already in sync]
PTT 242085: fields merged -> [already in sync]
PTT 242086: fields merged -> [already in sync]
PTT 242087: fields merged -> [already in sync]
PTT 242090: fields merged -> [already in sync]
PTT 242091: fields merged -> [already in sync]
PTT 244279: fields merged -> [already in sync]
PTT 244285: fields merged -> [already in sync]
PTT 244289: fields merged -> [already in sync]
PTT 244292: fields merged -> [already in sync]
PTT 283700: fields merged -> [already in sync]
PTT 283705: fields merged -> [already in sync]
PTT 283710: fields merged -> [already in sync]
PTT 284104: fields merged -> [already in sync]
PTT 284105: fields merged -> [already in sync]
PTT 36109: fields merged -> [already in sync]
PTT 43571: fields merged -> [already in sync]
PTT 43574: fields merged -> [already in sync]
PTT 43575: fields merged -> [already in sync]
PTT 43577: fields merged -> [already in sync]
PTT 43578: fields merged -> [already in sync]
PTT 43580: fields merged -> [already in sync]
PTT 43582: fields merged -> [already in sync]
PTT 43583: fields merged -> [already in sync]
PTT 43584: fields merged -> [already in sync]
PTT 43585: fields merged -> [already in sync]
PTT 43596: fields merged -> [already in sync]
PTT 43605: fields merged -> [already in sync]
PTT 43607: fields merged -> [already in sync]
PTT 43610: fields merged -> [already in sync]
PTT 43616: fields merged -> [already in sync]
```

## 2. Creations Planned (66 Docs)
These PTTs only existed under `trans-<pid>`. They will be created under canonical numeric ID:
```
PTT 242082: legacy doc 'trans-242082' promoted to canonical '242082'
PTT 242084: legacy doc 'trans-242084' promoted to canonical '242084'
PTT 242088: legacy doc 'trans-242088' promoted to canonical '242088'
PTT 242089: legacy doc 'trans-242089' promoted to canonical '242089'
PTT 244276: legacy doc 'trans-244276' promoted to canonical '244276'
PTT 244278: legacy doc 'trans-244278' promoted to canonical '244278'
PTT 244280: legacy doc 'trans-244280' promoted to canonical '244280'
PTT 244282: legacy doc 'trans-244282' promoted to canonical '244282'
PTT 244283: legacy doc 'trans-244283' promoted to canonical '244283'
PTT 244286: legacy doc 'trans-244286' promoted to canonical '244286'
PTT 244287: legacy doc 'trans-244287' promoted to canonical '244287'
PTT 244288: legacy doc 'trans-244288' promoted to canonical '244288'
PTT 244290: legacy doc 'trans-244290' promoted to canonical '244290'
PTT 244291: legacy doc 'trans-244291' promoted to canonical '244291'
PTT 244295: legacy doc 'trans-244295' promoted to canonical '244295'
PTT 252870: legacy doc 'trans-252870' promoted to canonical '252870'
PTT 252892: legacy doc 'trans-252892' promoted to canonical '252892'
PTT 266362: legacy doc 'trans-266362' promoted to canonical '266362'
PTT 266364: legacy doc 'trans-266364' promoted to canonical '266364'
PTT 266365: legacy doc 'trans-266365' promoted to canonical '266365'
PTT 266366: legacy doc 'trans-266366' promoted to canonical '266366'
PTT 266367: legacy doc 'trans-266367' promoted to canonical '266367'
PTT 266368: legacy doc 'trans-266368' promoted to canonical '266368'
PTT 266369: legacy doc 'trans-266369' promoted to canonical '266369'
PTT 266370: legacy doc 'trans-266370' promoted to canonical '266370'
PTT 266371: legacy doc 'trans-266371' promoted to canonical '266371'
PTT 283699: legacy doc 'trans-283699' promoted to canonical '283699'
PTT 283701: legacy doc 'trans-283701' promoted to canonical '283701'
PTT 283702: legacy doc 'trans-283702' promoted to canonical '283702'
PTT 283703: legacy doc 'trans-283703' promoted to canonical '283703'
PTT 283704: legacy doc 'trans-283704' promoted to canonical '283704'
PTT 283706: legacy doc 'trans-283706' promoted to canonical '283706'
PTT 283709: legacy doc 'trans-283709' promoted to canonical '283709'
PTT 283711: legacy doc 'trans-283711' promoted to canonical '283711'
PTT 283712: legacy doc 'trans-283712' promoted to canonical '283712'
PTT 283713: legacy doc 'trans-283713' promoted to canonical '283713'
PTT 283714: legacy doc 'trans-283714' promoted to canonical '283714'
PTT 283715: legacy doc 'trans-283715' promoted to canonical '283715'
PTT 283716: legacy doc 'trans-283716' promoted to canonical '283716'
PTT 283717: legacy doc 'trans-283717' promoted to canonical '283717'
PTT 283718: legacy doc 'trans-283718' promoted to canonical '283718'
PTT 283719: legacy doc 'trans-283719' promoted to canonical '283719'
PTT 283720: legacy doc 'trans-283720' promoted to canonical '283720'
PTT 283721: legacy doc 'trans-283721' promoted to canonical '283721'
PTT 283722: legacy doc 'trans-283722' promoted to canonical '283722'
PTT 284098: legacy doc 'trans-284098' promoted to canonical '284098'
PTT 284099: legacy doc 'trans-284099' promoted to canonical '284099'
PTT 284101: legacy doc 'trans-284101' promoted to canonical '284101'
PTT 284102: legacy doc 'trans-284102' promoted to canonical '284102'
PTT 284107: legacy doc 'trans-284107' promoted to canonical '284107'
PTT 284109: legacy doc 'trans-284109' promoted to canonical '284109'
PTT 36130: legacy doc 'trans-36130' promoted to canonical '36130'
PTT 36132: legacy doc 'trans-36132' promoted to canonical '36132'
PTT 36133: legacy doc 'trans-36133' promoted to canonical '36133'
PTT 36137: legacy doc 'trans-36137' promoted to canonical '36137'
PTT 36139: legacy doc 'trans-36139' promoted to canonical '36139'
PTT 43598: legacy doc 'trans-43598' promoted to canonical '43598'
PTT 43618: legacy doc 'trans-43618' promoted to canonical '43618'
PTT 43619: legacy doc 'trans-43619' promoted to canonical '43619'
PTT 43620: legacy doc 'trans-43620' promoted to canonical '43620'
PTT 43623: legacy doc 'trans-43623' promoted to canonical '43623'
PTT 43624: legacy doc 'trans-43624' promoted to canonical '43624'
PTT 43625: legacy doc 'trans-43625' promoted to canonical '43625'
PTT 43627: legacy doc 'trans-43627' promoted to canonical '43627'
PTT 43628: legacy doc 'trans-43628' promoted to canonical '43628'
PTT 43632: legacy doc 'trans-43632' promoted to canonical '43632'
```

## 3. Deletions Planned (99 Docs)
All legacy prefixed documents and malformed IDs will be deleted from the `transmitters` collection:
```
trans-242080, trans-242081, trans-242082, trans-242084, trans-242085, trans-242086, trans-242087, trans-242088, trans-242089, trans-242090, trans-242091, trans-244276, trans-244278, trans-244279, trans-244280, trans-244282, trans-244283, trans-244285, trans-244286, trans-244287, trans-244288, trans-244289, trans-244290, trans-244291, trans-244292, trans-244295, trans-252870, trans-252892, trans-266362, trans-266364, trans-266365, trans-266366, trans-266367, trans-266368, trans-266369, trans-266370, trans-266371, trans-283699, trans-283700, trans-283701, trans-283702, trans-283703, trans-283704, trans-283705, trans-283706, trans-283709, trans-283710, trans-283711, trans-283712, trans-283713, trans-283714, trans-283715, trans-283716, trans-283717, trans-283718, trans-283719, trans-283720, trans-283721, trans-283722, trans-284098, trans-284099, trans-284101, trans-284102, trans-284104, trans-284105, trans-284107, trans-284109, trans-36109, trans-36130, trans-36132, trans-36133, trans-36137, trans-36139, trans-43571, trans-43574, trans-43575, trans-43577, trans-43578, trans-43580, trans-43582, trans-43583, trans-43584, trans-43585, trans-43596, trans-43598, trans-43605, trans-43607, trans-43610, trans-43616, trans-43618, trans-43619, trans-43620, trans-43623, trans-43624, trans-43625, trans-43627, trans-43628, trans-43632, trans-
```

## 4. Verification Check
- Birds collection verified: all 20 birds point to numeric IDs (0 legacy references).
- Positions collection verified: clean numeric `platformId` / `transmitter_id`.
- Post-migration count expectation: exactly **98** documents, all matching `^\d{3,10}$`.
