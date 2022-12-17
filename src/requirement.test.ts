import { buildRequirements } from "./main-helper";

let mockTeams: {[key:string]: string[]} | undefined;

jest.mock('./github', () => ({
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
    const [requirement] = buildRequirements(`${path} ${teams.join(' ')}`, [path]);
    return requirement;
}

describe('CODEOWNERS based Requirements', () => {
    it ('star matches all files', () => {
        const requirement = buildCodeownersRequirement('*', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPath('anyfile', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('subdir/file.txt', matchedPaths)).toBe(true);
        expect(matchedPaths).toEqual(['anyfile', 'subdir/file.txt']);
    });

    it ('*.extension matches extension anywhere in the tree', () => {
        const requirement = buildCodeownersRequirement('*.js', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPath('hi', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('hi.txt', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('hi.js', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('subdir/hi.js', matchedPaths)).toBe(true);
        expect(matchedPaths.sort()).toEqual(['hi.js', 'subdir/hi.js'].sort());
    });

    it ('directories match all subfiles', () => {
        const requirement = buildCodeownersRequirement('/build/logs/', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPath('build',matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('build/logs/',matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('build/logs/file.txt',matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('build/logs/subdir/hi.js',matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('a_different_root/build/logs/subdir',matchedPaths)).toBe(false);
        expect(matchedPaths.sort()).toEqual([
            'build/logs/',
            'build/logs/file.txt',
            'build/logs/subdir/hi.js',
        ].sort())
    });

    it ('dir with /* matches one level after dir', () => {
        const requirement = buildCodeownersRequirement('docs/*', ['team']);
        const matchedPaths: string[] = [];
        expect(requirement.appliesToPath('/docs', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('/docs/', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('/docs/logs/', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/docs/file.txt', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/docs/logs/file.txt', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('/docs/logs/subdir/hi.js', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('/nested/docs/logs/', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/nested/docs/file.txt', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/a_different_root/build/logs/subdir', matchedPaths)).toBe(false);
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
        expect(requirement.appliesToPath('/docs', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('/apps', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/docs/apps', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/docs/apps/', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/docs/file.txt', matchedPaths)).toBe(false);
        expect(requirement.appliesToPath('/docs/apps/file.txt', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/deep/deep/deep/deep/deep/apps/hi.js', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/apps/deep/deep/deep/deep/deep/hi.js', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/apps/apps/apps/apps/apps/apps/apps/hi.js', matchedPaths)).toBe(true);
        expect(requirement.appliesToPath('/a_different_root/build/logs/subdir', matchedPaths)).toBe(false);
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
