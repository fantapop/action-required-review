import { buildRequirements } from "./main-helper";

let mockTeams: {[key:string]: string[]} | undefined;

jest.mock('./team-members', () => ({
        __esModule: true,
        fetchTeamMembers: jest.fn((team: string): string[] | undefined => {
            if ( team.startsWith( '@' ) ) {
                return [ team.slice(1) ];
            }
            else {
                if (!mockTeams) {
                    throw new Error('mockTeams cannot be empty for this test')
                }
                else {
                    return mockTeams[team];
                }
            }
        }),
}));

const buildCodeownersRequirement = (path: string, teams: string[]) => {
    const [requirement] = buildRequirements(`${path} ${teams.join(' ')}`, true /* isCodeowners */, [path]);
    return requirement;
}

describe('CODEOWNERS based Requirements', () => {
    it ('star matches all files', () => {
        const requirement = buildCodeownersRequirement('*', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPaths(['anyfile', 'subdir/file.txt'], matchedPaths)).toBe(true);
        expect(matchedPaths).toEqual(['anyfile', 'subdir/file.txt']);
    });

    it ('*.extension matches extension anywhere in the tree', () => {
        const requirement = buildCodeownersRequirement('*.js', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPaths(['hi', 'hi.txt', 'hi.js', 'subdir/hi.js'], matchedPaths));
        expect(matchedPaths.sort()).toEqual(['hi.js', 'subdir/hi.js'].sort());
    });

    it ('directories match all subfiles', () => {
        const requirement = buildCodeownersRequirement('/build/logs/', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPaths([
            'build',
            'build/logs/',
            'build/logs/file.txt',
            'build/logs/subdir/hi.js',
            'a_different_root/build/logs/subdir',
        ], matchedPaths));
        expect(matchedPaths.sort()).toEqual([
            'build/logs/',
            'build/logs/file.txt',
            'build/logs/subdir/hi.js',
        ].sort())
    });

    it ('dir with /* matches one level after dir', () => {
        const requirement = buildCodeownersRequirement('docs/*', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPaths([
            '/docs',
            '/docs/',
            '/docs/logs/',
            '/docs/file.txt',
            '/docs/logs/file.txt',
            '/docs/logs/subdir/hi.js',
            '/nested/docs/logs/',
            '/nested/docs/file.txt',
            '/a_different_root/build/logs/subdir',
        ], matchedPaths));
        expect(matchedPaths.sort()).toEqual([
            '/docs/file.txt',
            '/docs/logs/',
            '/nested/docs/logs/',
            '/nested/docs/file.txt',
        ].sort())
    });

    it ('dir without / prefix matches at any level', () => {
        const requirement = buildCodeownersRequirement('apps/', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPaths([
            '/docs',
            '/apps',
            '/docs/apps',
            '/docs/apps/',
            '/docs/file.txt',
            '/docs/apps/file.txt',
            '/deep/deep/deep/deep/deep/apps/hi.js',
            '/apps/deep/deep/deep/deep/deep/hi.js',
            '/apps/apps/apps/apps/apps/apps/apps/hi.js',
            '/a_different_root/build/logs/subdir',
        ], matchedPaths));
        expect(matchedPaths.sort()).toEqual([
            '/apps',
            '/docs/apps',
            '/docs/apps/',
            '/docs/apps/file.txt',
            '/deep/deep/deep/deep/deep/apps/hi.js',
            '/apps/deep/deep/deep/deep/deep/hi.js',
            '/apps/apps/apps/apps/apps/apps/apps/hi.js',
        ].sort())
    });

    it ('any one specified team or user can provide review', async () => {

        mockTeams = {
            team1: ['user1', 'user2'],
            team2: ['user3', 'user4'],
        }

        let requirement = buildCodeownersRequirement('file.txt', ['@user']);
        expect(await requirement.isSatisfied(['user'])).toBe(true)

        requirement = buildCodeownersRequirement('file.txt', ['team1']);
        expect(await requirement.isSatisfied(['user1'])).toBe(true)
        expect(await requirement.isSatisfied(['user3'])).toBe(false)
        expect(await requirement.isSatisfied([])).toBe(false)

        requirement = buildCodeownersRequirement('file.txt', ['team1', 'team2']);
        expect(await requirement.isSatisfied(['user1'])).toBe(true)
        expect(await requirement.isSatisfied(['user3'])).toBe(true)
    });
});
