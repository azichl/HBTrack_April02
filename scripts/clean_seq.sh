#!/bin/bash
echo "Cleaning up positions..."
for path in $(grep "__path__" /Users/abdelazizchlih/.gemini/antigravity/brain/93309266-78a9-48bf-8fcb-eba78be86de5/.system_generated/steps/2317/output.txt | awk '{print $3}'); do
  npx firebase-tools firestore:delete -f --project trackapp-v2 "$path"
done
echo "Positions cleaned."

echo "Cleaning up lon=0 positions..."
for path in $(grep "__path__" /Users/abdelazizchlih/.gemini/antigravity/brain/93309266-78a9-48bf-8fcb-eba78be86de5/.system_generated/steps/2346/output.txt | awk '{print $3}'); do
  npx firebase-tools firestore:delete -f --project trackapp-v2 "$path"
done
echo "lon=0 positions cleaned."
