#!/usr/bin/env node
// Bumps the app version in the root package.json.
//   default:  minor   (0.4.2 → 0.5.0)
//   BUMP=patch          (0.4.2 → 0.4.3)
//   BUMP=major          (0.4.2 → 1.0.0)
// Usage on a commit is automatic (see .githooks/prepare-commit-msg); to bump
// manually:  BUMP=patch node scripts/bump-version.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
const raw = readFileSync(pkgPath, 'utf8')

const match = raw.match(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/)
if (!match) {
	console.error('bump-version: no semver "version" found in package.json')
	process.exit(1)
}

const [maj, min, pat] = [Number(match[1]), Number(match[2]), Number(match[3])]
const bump = (process.env.BUMP || 'minor').toLowerCase()

let next
switch (bump) {
	case 'major':
		next = `${maj + 1}.0.0`
		break
	case 'minor':
		next = `${maj}.${min + 1}.0`
		break
	case 'patch':
		next = `${maj}.${min}.${pat + 1}`
		break
	default:
		console.error(`bump-version: unknown BUMP='${bump}' (use major|minor|patch)`)
		process.exit(1)
}

// Replace only the version substring so the file's formatting is untouched.
writeFileSync(pkgPath, raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`))

// Stage it so the bump rides along in the same commit.
try {
	execSync(`git add "${pkgPath}"`, { stdio: 'ignore' })
} catch {
	// Not fatal when run outside a git commit.
}

console.log(`bump-version: ${maj}.${min}.${pat} → ${next} (${bump})`)
