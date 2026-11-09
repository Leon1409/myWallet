import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Wersja aplikacji — w obrazie addonu Dockerfile wgrywa addon/config.yaml
// do /app/addon-config.yaml (jedno źródło prawdy z Supervisor HA).
// Lokalnie/dev: pliku brak -> 'dev' (baner aktualizacji się nie pokazuje).
let cached = null;

export function appVersion() {
  if (cached) return cached;
  try {
    const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../addon-config.yaml');
    const m = readFileSync(configPath, 'utf8').match(/^version:\s*"?([^"\n]+)"?/m);
    cached = m ? m[1].trim() : 'dev';
  } catch {
    cached = 'dev';
  }
  return cached;
}
