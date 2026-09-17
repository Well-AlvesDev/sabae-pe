import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const packagePath = path.join(projectRoot, 'package.json');
const lockfilePath = path.join(projectRoot, 'package-lock.json');
const appVersionPath = path.join(projectRoot, 'src', 'app', 'app-version.ts');

const requestedBump = process.argv.find(argument => ['--patch', '--minor', '--major'].includes(argument))?.slice(2);
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const currentVersion = packageJson.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

if ([major, minor, patch].some(Number.isNaN)) {
    throw new Error(`Versão inválida no package.json: ${currentVersion}`);
}

function getGitOutput(...argumentsList) {
    try {
        return execFileSync('git', argumentsList, {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {
        return '';
    }
}

const packageAtHead = getGitOutput('show', 'HEAD:package.json');
if (!requestedBump && packageAtHead) {
    const previousVersion = JSON.parse(packageAtHead).version;
    if (previousVersion !== currentVersion) {
        console.log(`A versão já foi atualizada neste conjunto de mudanças: ${currentVersion}`);
        process.exit(0);
    }
}

const diff = getGitOutput('diff', 'HEAD', '--');
const stats = getGitOutput('diff', '--numstat', 'HEAD', '--')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
        const [added, removed, file] = line.split('\t');
        return {
            added: Number(added) || 0,
            removed: Number(removed) || 0,
            file,
        };
    });
const changedLines = stats.reduce((total, file) => total + file.added + file.removed, 0);

if (!requestedBump && changedLines === 0) {
    throw new Error('Nenhuma mudança rastreada foi encontrada para calcular uma nova versão.');
}

const bump = requestedBump
    || (diff.includes('BREAKING CHANGE') || /BREAKING[ -]CHANGE|!:/i.test(diff)
        ? 'major'
        : changedLines >= 500
            ? 'major'
            : changedLines >= 50
                ? 'minor'
                : 'patch');

const nextVersion = bump === 'major'
    ? `${major + 1}.0.0`
    : bump === 'minor'
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`;

packageJson.version = nextVersion;
const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'));
lockfile.version = nextVersion;
if (lockfile.packages?.['']) {
    lockfile.packages[''].version = nextVersion;
}

await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`);
await writeFile(appVersionPath, `export const APP_VERSION = '${nextVersion}';\n`);

console.log(`Versão atualizada: ${currentVersion} -> ${nextVersion} (${bump}; ${changedLines} linhas alteradas)`);
