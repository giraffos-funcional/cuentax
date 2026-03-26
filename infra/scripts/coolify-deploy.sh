#!/bin/bash
T="1|393zYVmXBz07CPnylFUcbPe4EIA1osoirVzmrvrr9a2aa4f7"
U="https://deploy.giraffos.com/api/v1"

echo "[1/3] Deploy BFF..."
curl -s "$U/deploy?uuid=qk0wco4csksg8sso84o00s8c" -H "Authorization: Bearer $T"
echo ""

echo "[2/3] Deploy Web..."
curl -s "$U/deploy?uuid=vkscocgg04scwg04wsow8wsk" -H "Authorization: Bearer $T"
echo ""

echo "[3/3] Status check..."
sleep 5
for APP in isg4o4gg00wkko0888s0wgco qk0wco4csksg8sso84o00s8c vkscocgg04scwg04wsow8wsk; do
  STATUS=$(curl -s "$U/applications/$APP" -H "Authorization: Bearer $T" | grep -o '"status":"[^"]*"' | head -1)
  echo "$APP -> $STATUS"
done
