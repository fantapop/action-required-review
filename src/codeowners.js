function buildRequirement(line, enforceOn) {
    const [path, ...rest] = line.trim().split(/\s+/)
    if (enforceOn === path) {
        return {
            "paths": [linePath],
            "teams": rest,
        };
    }

    return
}

function parseCodeOwners(data, enforceOn) {
    const lines = data.split('\n');
    return lines.map(line => buildRequirement(line, enforceOn)).filter(value => !!value);
}

module.exports = parseCodeOwners;
