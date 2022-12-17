import * as core from '@actions/core';
import * as github from '@actions/github';

export enum State {
	ERROR = 'error',
	FAILURE = 'failure',
	PENDING = 'pending',
	SUCCESS = 'success',
};

const teamMemberCache: {[key:string]: string[]} = {};

const SUPPORTED_MESSAGE = 'action only supported for pull_request_review and pull_request triggers';

function getOctokit () {
	const octokit = github.getOctokit( core.getInput( 'token', { required: true } ) );
	const { payload } = github.context;

	if (!payload.repository) {
		throw new Error(`unexpected missing repository, ${SUPPORTED_MESSAGE}`);
	}
	if (!payload.pull_request) {
		throw new Error(`unexpected missing pull_request, ${SUPPORTED_MESSAGE}`);
	}

	const owner = payload.repository.owner.login;
	const repo = payload.repository.name;
	const pr = payload.pull_request.number;
    const sha = payload.pull_request.head.sha;

    return {octokit, owner, repo, pr, sha};
}

/**
 * Fetch the reviewers approving the current PR.
 *
 * @returns {string[]} Reviewers.
 */
export async function fetchReviewers(): Promise<string[]> {
	const {octokit, owner, repo, pr} = getOctokit();

	const reviewers = new Set<string>();
	try {
		for await ( const res of octokit.paginate.iterator( octokit.rest.pulls.listReviews, {
			owner: owner,
			repo: repo,
			pull_number: pr,
			per_page: 100,
		} ) ) {
			res.data.forEach( review => {
				// GitHub may return more than one review per user, but only counts the last non-comment one for each.
				// "APPROVED" allows merging, while "CHANGES_REQUESTED" and "DISMISSED" do not.
				if ( review.state === 'APPROVED' ) {

					if (!review.user) {
						core.warning('Unexpected missing user in review object, skipping');
						return;
					}

					reviewers.add( review.user.login );
				} else if ( review.state !== 'COMMENTED' ) {
					if (!review.user) {
						core.warning('Unexpected missing user in review object, skipping');
						return;
					}
					reviewers.delete( review.user.login );
				}
			} );
		}
	} catch ( error ) {
		core.error("error caused reviewer check to fail: " + error)
		throw new Error(
			`Failed to query ${ owner }/${ repo } PR #${ pr } reviewers from GitHub: ${error}`,
		);
	}

	return [ ...reviewers ].sort();
}

/**
 * Fetch the paths in the current PR.
 *
 * @returns {string[]} Paths.
 */
export async function fetchPaths(): Promise<string[]> {

	const {octokit, owner, repo, pr} = getOctokit();

	const paths: {[key:string]: boolean} = {};
	try {
		for await ( const res of octokit.paginate.iterator( octokit.rest.pulls.listFiles, {
			owner: owner,
			repo: repo,
			pull_number: pr,
			per_page: 100,
		} ) ) {
			res.data.forEach( file => {
				paths[ file.filename ] = true;
				if ( file.previous_filename ) {
					paths[ file.previous_filename ] = true;
				}
			} );
		}
	} catch ( error ) {
		throw new Error(
			`Failed to query ${ owner }/${ repo } PR #${ pr } files from GitHub: ${error}`,
		);
	}

	return Object.keys( paths ).sort();
}

/**
 * Report a status check to GitHub.
 *
 * @param {State} state - The status to check
 * @param {string} description - Description for the status.
 */
export async function status( state: State, description: string ) {
	const {octokit, owner, repo, sha} = getOctokit();

	const req = {
		owner,
		repo,
		sha,
		state,
		target_url: `https://github.com/${ owner }/${ repo }/actions/runs/${ github.context.runId }`,
		description,
		context: core.getInput( 'status', { required: true } ),
	};

	if ( process.env.CI ) {
		await octokit.rest.repos.createCommitStatus( req );
	} else {
		// eslint-disable-next-line no-console
		console.dir( req );
	}
}

/**
 * Error class for friendly GitHub Action error reporting.
 *
 * Use it like
 * ```
 * throw ReportError.create( 'Status description', originalError );
 * ```
 */
export class ReportError extends Error {
	private _cause: unknown 
	constructor(message: string, cause: unknown) {
		super(message);
		this._cause = cause;
		Object.setPrototypeOf(this, ReportError.prototype);
	}

	public cause() {
		return this._cause;
	}
}

/**
 * Fetch the members of a team for the purpose of verifying a review Requirement.
 * Special case: Names prefixed with @ are considered to be a one-member team with the named GitHub user.
 *
 * @param {string} team - GitHub team slug, or @ followed by a GitHub user name.
 * @returns {string[]} Team members.
 */
export async function fetchTeamMembers( teamOrUser: string ) {
	// Handle @singleuser virtual teams.
	if ( teamOrUser.startsWith( '@' ) ) {
		return [ teamOrUser.slice( 1 ) ];
	}

	const team = teamOrUser;

	if ( teamMemberCache[ team ] ) {
		return teamMemberCache[ team ];
	}

	const {octokit, owner} = getOctokit()

	let members: string[] = [];
	try {
		for await ( const res of octokit.paginate.iterator( octokit.rest.teams.listMembersInOrg, {
			org: owner,
			team_slug: team,
			per_page: 100,
		} ) ) {
			members = members.concat( res.data.map( v => v.login ) );
		}
	} catch ( error ) {
		throw new Error(`Failed to query ${ owner } team ${ team } from GitHub: ${error}` );
	}

	teamMemberCache[ team ] = members;
	return members;
}
