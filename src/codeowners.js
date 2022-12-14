const core = require('@actions/core');

function buildRequirement(line, enforceOnPaths) {

    if (!line) {
        return;
    }

    const trimmedLine = line.trim()

    if (trimmedLine.startsWith('#')) {
        return;
    }

    const [path, ...teams] = trimmedLine.split(/\s+/)
    if (core.isDebug) {
        core.debug(`parsed line from codeowners: path: ${path}, teams: ${teams}`)
    }
    if (enforceOnPaths.includes(path)) {
        return {
            "paths": [path],
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
    return lines.map(line => buildRequirement(line, enforceOnPaths)).filter(value => !!value);
}

module.exports = parseCodeOwners;
