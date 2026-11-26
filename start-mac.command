#!/bin/bash
# Režie Live – spuštění na Macu (dvojklik). Poprvé: pravý klik → Otevřít.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js není nainstalovaný – stáhni ho z https://nodejs.org a spusť tento soubor znovu."
  read -n1 -r -p "Stiskni klávesu…"; exit 1
fi
(sleep 2; open "http://localhost:8080") &
node server.js
