const core = require('@actions/core');

function convertToPicomatchCompatiblePath(path, teams) {

    // github * means match anything
    if (path === '*') {
        return '**';
    }

    let picoPath = path;

    // codeowners path patterns that are anchored to the start of the root of
    // the repo have a preceding forward slash but the file paths that come in
    // do not.
    if (picoPath.startsWith('/')) {
        picoPath = picoPath.substring(1);
    }
    else {
        // floating github paths should match any subdirectory
        picoPath = `**/${picoPath}`;
    }

    // directory github paths match all subdirs and files
    if (picoPath.endsWith('/')) {
        picoPath = `${picoPath}**`;
    }

    return picoPath;
}

function buildRequirement(line, enforceOnPaths) {

    if (!line) {
        return;
    }

    // trim line and get rid of trailing comments
    let trimmedLine = line.split(/#/)[0].trim();

    if (trimmedLine === "" || trimmedLine.startsWith('#')) {
        return;
    }

    const [path, ...teams] = trimmedLine.split(/\s+/)
    if (core.isDebug) {
        core.debug(`parsed line from codeowners: path: ${path}, teams: ${teams}`)
    }

    if (enforceOnPaths.includes(path)) {
        return {
            paths: [ convertToPicomatchCompatiblePath(path, teams) ],
            teams,
        };
    }

    return
}

function parseCodeOwners(data, enforceOnPaths) {
    const lines = data.split('\n');
    if (core.isDebug) {
        core.debug(`about to parse code owners: ${lines.join('\n')}`)
    }

    const codeOwnersRequirements = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const requirement = buildRequirement(line, enforceOnPaths);

        if (!requirement) {
            continue;
        }

        codeOwnersRequirements.push(requirement);
    }

    return codeOwnersRequirements;
}

module.exports = parseCodeOwners;
