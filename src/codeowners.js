function parseLine(line, enforceOn) {
    const lineList = line.split(/(\s+)/).filter(
        e => { return e.trim().length > 0; }
    );
    const linePath = lineList[0]
    if (enforceOn === linePath) {
        const result = {
            "paths": [linePath],
            "teams": lineList.slice(1)
        }
        return result
    }

    return null
}

function parseCodeOwners(data, enforceOn) {
    const dataArray = data.split('\n');
    const result = Promise.all(dataArray.map(line => parseLine(line, enforceOn)));

    return result.filter(value => !!value);
}

module.exports = parseCodeOwners;
