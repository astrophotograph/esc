#!/usr/bin/env node

/**
 * Version generation script for CalVer format with phase suffixes
 * Format: YY.MM.DD[-phase][.patch]
 * Examples: 25.07.26-pre-alpha, 25.07.26-alpha.1, 25.07.26-beta.2, 25.07.26-rc.1, 25.07.26
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitInfo() {
  try {
    const isGitRepo = execSync('git rev-parse --is-inside-work-tree 2>/dev/null || echo false', { 
      encoding: 'utf8' 
    }).trim() === 'true';
    
    if (!isGitRepo) {
      return { hasGit: false };
    }

    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const isDirty = execSync('git diff --quiet 2>/dev/null; echo $?', { encoding: 'utf8' }).trim() !== '0';
    
    // Get latest tag (if any)
    let latestTag = null;
    try {
      latestTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', { 
        encoding: 'utf8' 
      }).trim();
    } catch (e) {
      // No tags found
    }

    // Count commits since latest tag (if tag exists)
    let commitsSinceTag = 0;
    if (latestTag) {
      try {
        commitsSinceTag = parseInt(execSync(`git rev-list ${latestTag}..HEAD --count`, { 
          encoding: 'utf8' 
        }).trim());
      } catch (e) {
        // If error, assume no commits since tag
      }
    }

    return {
      hasGit: true,
      hash,
      isDirty,
      latestTag,
      commitsSinceTag
    };
  } catch (error) {
    return { hasGit: false };
  }
}

function generateCalVerVersion(phase = null, patchNumber = null) {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // Last 2 digits
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  
  let version = `${year}.${month}.${day}`;
  
  if (phase) {
    version += `-${phase}`;
    if (patchNumber && patchNumber > 0) {
      version += `.${patchNumber}`;
    }
  }
  
  return version;
}

function determineVersionFromGit(gitInfo) {
  if (!gitInfo.hasGit) {
    // No git, generate basic CalVer with pre-alpha suffix
    return generateCalVerVersion('pre-alpha');
  }

  // Check if we're on a release tag
  if (gitInfo.latestTag && gitInfo.commitsSinceTag === 0 && !gitInfo.isDirty) {
    // Clean release tag - parse the tag if it's CalVer format
    const calVerMatch = gitInfo.latestTag.match(/^v?(\d{2}\.\d{2}\.\d{2}(?:-(?:pre-alpha|alpha|beta|rc)(?:\.\d+)?)?)/);
    if (calVerMatch) {
      return calVerMatch[1];
    }
    // If tag doesn't match CalVer, generate new CalVer
    return generateCalVerVersion();
  }

  // Development version - determine phase based on latest tag
  if (gitInfo.latestTag) {
    const tagMatch = gitInfo.latestTag.match(/^v?(\d{2}\.\d{2}\.\d{2})-?(pre-alpha|alpha|beta|rc)?\.?(\d+)?/);
    if (tagMatch) {
      const [, baseVersion, currentPhase, patchNum] = tagMatch;
      
      // If commits since tag, increment the development version
      if (gitInfo.commitsSinceTag > 0) {
        // Generate new CalVer for today with appropriate phase
        const phase = currentPhase || 'pre-alpha';
        const patch = gitInfo.commitsSinceTag;
        return generateCalVerVersion(phase, patch);
      }
    }
  }

  // Default development version
  const phase = gitInfo.commitsSinceTag > 0 ? 'pre-alpha' : 'pre-alpha';
  const patch = gitInfo.commitsSinceTag || undefined;
  return generateCalVerVersion(phase, patch);
}

function generateBuildInfo(version, gitInfo) {
  const buildDate = new Date().toISOString();
  const buildNumber = process.env.GITHUB_RUN_NUMBER || 'local';
  
  return {
    version,
    buildDate,
    buildNumber,
    git: gitInfo.hasGit ? {
      hash: gitInfo.hash,
      isDirty: gitInfo.isDirty,
      latestTag: gitInfo.latestTag,
      commitsSinceTag: gitInfo.commitsSinceTag
    } : null
  };
}

function updatePackageJson(version) {
  const packagePath = path.join(__dirname, '../ui/package.json');
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    packageJson.version = version;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`Updated ui/package.json version to ${version}`);
  }
}

function writeBuildInfo(buildInfo) {
  const buildInfoPath = path.join(__dirname, '../ui/build-info.json');
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n');
  console.log(`Written build info to ui/build-info.json`);
}

function main() {
  const args = process.argv.slice(2);
  const forcePhase = args.find(arg => arg.startsWith('--phase='))?.split('=')[1];
  const forcePatch = args.find(arg => arg.startsWith('--patch='))?.split('=')[1];
  const updatePackage = args.includes('--update-package');
  
  const gitInfo = getGitInfo();
  
  let version;
  if (forcePhase) {
    const patch = forcePatch ? parseInt(forcePatch) : undefined;
    version = generateCalVerVersion(forcePhase, patch);
  } else {
    version = determineVersionFromGit(gitInfo);
  }
  
  const buildInfo = generateBuildInfo(version, gitInfo);
  
  console.log(`Generated version: ${version}`);
  console.log(`Build date: ${buildInfo.buildDate}`);
  console.log(`Build number: ${buildInfo.buildNumber}`);
  
  if (gitInfo.hasGit) {
    console.log(`Git hash: ${gitInfo.hash}`);
    console.log(`Git dirty: ${gitInfo.isDirty}`);
    if (gitInfo.latestTag) {
      console.log(`Latest tag: ${gitInfo.latestTag}`);
      console.log(`Commits since tag: ${gitInfo.commitsSinceTag}`);
    }
  }
  
  writeBuildInfo(buildInfo);
  
  if (updatePackage) {
    updatePackageJson(version);
  }
  
  // Output version for use in scripts
  process.stdout.write(version);
}

if (require.main === module) {
  main();
}

module.exports = {
  generateCalVerVersion,
  determineVersionFromGit,
  getGitInfo
};