import { access, cp, mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'dist', 'chrome-web-store');
const zipPath = path.join(projectRoot, 'dist', 'pokemon-cardmarket.zip');
const packageFiles = [
  'manifest.json',
  'background.js',
  'core.js',
  'settings.js',
  'runtime-guard.js',
  'pokemon-offers.js',
  'content.js',
  'pokemon.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'options.html',
  'options.js',
  'settings.css',
  'privacy.html',
  'assets/icons/cardmarket-16.png',
  'assets/icons/cardmarket-48.png',
  'assets/icons/cardmarket-128.png',
  'assets/grading/PROVENANCE.md',
  ...['ace', 'ags', 'ars', 'bgs', 'ccc', 'cgc', 'collect-aura', 'gma', 'graad', 'hga', 'ksa', 'mnt', 'pca', 'psa', 'pure-grading', 'sgc', 'tag']
    .map((brand) => `assets/grading/${brand}.svg`),
];

for (const pathToCheck of [outputDirectory, zipPath]) {
  try {
    await access(pathToCheck);
    throw new Error(`La sortie existe déjà : ${pathToCheck}. Déplace-la ou supprime-la après vérification avant de recréer le paquet.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await mkdir(outputDirectory, { recursive: true });
for (const file of packageFiles) {
  const target = path.join(outputDirectory, file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(projectRoot, file), target);
}

const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'manifest.json'), 'utf8'));
const referencedFiles = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((script) => script.js),
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action.default_icon || {}),
  ...manifest.web_accessible_resources.flatMap((resource) => resource.resources),
];
for (const file of referencedFiles) await access(path.join(outputDirectory, file));

const zip = spawnSync('zip', ['-r', '-q', zipPath, '.'], { cwd: outputDirectory, encoding: 'utf8' });
if (zip.error) throw zip.error;
if (zip.status !== 0) throw new Error(`La création de l’archive ZIP a échoué : ${zip.stderr || zip.status}`);

process.stdout.write(`Dossier préparé : ${outputDirectory}\nArchive préparée : ${zipPath}\n${packageFiles.length} fichiers copiés.\n`);
