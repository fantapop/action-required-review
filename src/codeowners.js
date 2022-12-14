const core = require('@actions/core');

function buildRequirement(line, enforceOn) {

    if (!line) {
        return;
    }

    const trimmedLine = line.trim()

    if (trimmedLine.startsWith('#')) {
        return;
    }

    const [path, ...teams] = trimmedLine.split(/\s+/)
    core.debug(`parsed line from codeowners: path: ${path}, teams: ${teams}`)
    if (enforceOn === path) {
        return {
            "paths": [path],
            teams,
        };
    }

    return
}

function parseCodeOwners(data, enforceOn) {
    const lines = data.split('\n');
    core.debug(`about to parse code owners: ${lines.join('\n')}`)
    return lines.map(line => buildRequirement(line, enforceOn)).filter(value => !!value);
}

module.exports = parseCodeOwners;
