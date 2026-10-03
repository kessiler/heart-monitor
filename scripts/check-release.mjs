import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, projectRoot), 'utf8');

function tomlVersion(source, section) {
  let inSection = false;
  for (const line of source.split(/\r?\n/)) {
    if (line.trim().startsWith('[')) {
      inSection = line.trim() === `[${section}]`;
    } else if (inSection) {
      const version = line.match(/^version\s*=\s*"([^"]+)"\s*$/)?.[1];
      if (version) return version;
    }
  }
  assert.fail(`Missing explicit version in TOML section [${section}]`);
}

const packageJson = JSON.parse(await read('package.json'));
const tauriConfig = JSON.parse(await read('src-tauri/tauri.conf.json'));
const versions = {
  'package.json': packageJson.version,
  'Cargo.toml': tomlVersion(await read('Cargo.toml'), 'workspace.package'),
  'src-tauri/Cargo.toml': tomlVersion(await read('src-tauri/Cargo.toml'), 'package'),
  'src-tauri/tauri.conf.json': tauriConfig.version,
};
assert.match(packageJson.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Use a stable X.Y.Z release version');
for (const [path, version] of Object.entries(versions)) {
  assert.equal(version, packageJson.version, `${path} must match package.json`);
}

const tag = process.argv[2]
  ?? (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
if (tag !== undefined) {
  assert.equal(tag, `v${packageJson.version}`, 'The tag must match the application version');
}
console.log(`Application versions agree at ${packageJson.version}${tag ? ` (${tag})` : ''}.`);
