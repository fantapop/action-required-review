import { buildRequirements, satisfiesAllRequirements } from "./main-helper";

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

describe('satisfiesAllRequirements', () => {
    mockTeams = {
        team1: ['user2'],
    }
    const requirements = buildRequirements(`
/dir1/file.txt @user1
/dir2/ @user2
/dir3/ team1
    `, true /* isCodeowners */, [
        '/dir1/file.txt',
        '/dir2/',
    ]);
    it('satisfies on no relevant paths', async () => {
        expect(await satisfiesAllRequirements(requirements, ['/someotherpath'], [])).toEqual(true);
    });
    it('does not satisfy when missing reviewers for any enforced path', async () => {
        expect(await satisfiesAllRequirements(requirements, [
            'dir2/123.txt',
        ], [])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/123.txt',
        ], ['user1'])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir1/file.txt',
        ], [])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir1/file.txt',
        ], ['user2'])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir1/file.txt',
        ], ['someone-else'])).toEqual(false);
    });
    it('can be satisfied by the same user', async () => {
        expect(await satisfiesAllRequirements(requirements, [
            'dir2/123.txt',
            'dir3/123.txt',
        ], ['user2'])).toEqual(true);
    });
    it('satisfies when required reviewers have reviewed', async () => {
        expect(await satisfiesAllRequirements(requirements, [
            'dir2/123.txt',
        ], ['user2'])).toEqual(true);
        expect(await satisfiesAllRequirements(requirements, [
            'dir1/file.txt',
        ], ['user1'])).toEqual(true);
    });
    it('requires reviewers for each requirement', async () => {
        expect(await satisfiesAllRequirements(requirements, [
            'dir1/file.txt',
            'dir2/123.txt',
        ], ['user2'])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir1/file.txt',
            'dir2/123.txt',
        ], ['user1'])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir1/file.txt',
            'dir2/123.txt',
        ], ['user1', 'user2'])).toEqual(true);
    });

    it('allows unrequiring paths by setting them as blank', async () => {

        const requirements = buildRequirements(`
/dir2/ @user2
/dir2/left-out.txt
        `, true /* isCodeowners */, [
            '/dir2/',
            '/dir2/left-out.txt',
        ]);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/left-out.txt',
        ], [])).toEqual(true);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/still-in.txt',
        ], [])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/still-in.txt',
        ], ['user2'])).toEqual(true);
    });

    it('allows nested unrequiring', async () => {

        const requirements = buildRequirements(`
/dir2/ @user2
/dir2/left-out/
/dir2/left-out/still-required.txt @user2
        `, true /* isCodeowners */, [
            '/dir2/',
            '/dir2/left-out/',
            '/dir2/left-out/still-required.txt',
        ]);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/a-file.txt',
        ], [])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/a-file.txt',
        ], ['user2'])).toEqual(true);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/left-out/a-file.txt',
        ], [])).toEqual(true);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/left-out/still-required.txt',
        ], [])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/left-out/still-required.txt',
        ], ['user2'])).toEqual(true);

    });

    it('what happens with overrides', async () => {

        const requirements = buildRequirements(`
/dir2/ @user2
/dir2/ @user1
        `, true /* isCodeowners */, [
            '/dir2/',
        ]);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/123.txt',
        ], [])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/123.txt',
        ], ['user2'])).toEqual(false);

        expect(await satisfiesAllRequirements(requirements, [
            'dir2/123.txt',
        ], ['user1'])).toEqual(true);
    });
});

