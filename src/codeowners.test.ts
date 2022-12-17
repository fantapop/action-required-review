import { parseCodeowners } from "./codeowners";

describe('parseCodeowners', () => {
    it ('handles ignores commented lines', () => {
        const codeownersString = `
#commented no space in between
# commented out with space after 
/path team
   #comment with preceding space
        `;
        expect(parseCodeowners(codeownersString, ['/path'] /* enforceOnPaths */)).toEqual([{
            path: 'path',
            teams: ['team']
        }])
    });
    it ('handles trailing comments correctly', () => {
        const codeownersString = '/path team # trailing comment';
        expect(parseCodeowners(codeownersString, ['/path'] /* enforceOnPaths */)).toEqual([{
            path: 'path',
            teams: ['team']
        }])
    });
    it ('parses out all teams', () => {
        const codeownersString = '/path team1 team2 team3';
        expect(parseCodeowners(codeownersString, ['/path'] /* enforceOnPaths */)).toEqual([{
            path: 'path',
            teams: ['team1', 'team2', 'team3']
        }])
    });
    it ('only includes paths found in enforceOnPaths', () => {
        const codeownersString = `
/path1 team1
/path2 team2
/path3 team3`;
        expect(parseCodeowners(codeownersString, ['/path1', '/path3'] /* enforceOnPaths */)).toEqual([{
            path: 'path1',
            teams: ['team1']
        }, {
            path: 'path3',
            teams: ['team3']
        },
    ])
    });
});
