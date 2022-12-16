import * as core from '@actions/core';
import * as github from '@actions/github';

const SUPPORTED_MESSAGE = 'action only supported for pull_request_review and pull_request triggers';

/**
 * Fetch the paths in the current PR.
 *
 * @returns {string[]} Paths.
 */
export async function fetchPaths(): Promise<string[]> {
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
