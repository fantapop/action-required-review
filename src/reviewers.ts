import * as core from '@actions/core';
import * as github from '@actions/github';

const SUPPORTED_MESSAGE = 'action only supported for pull_request_review and pull_request triggers';

/**
 * Fetch the reviewers approving the current PR.
 *
 * @returns {string[]} Reviewers.
 */
export async function fetchReviewers(): Promise<string[]> {
	const octokit = github.getOctokit( core.getInput( 'token', { required: true } ) );
	const { payload } =  github.context;

	if (!payload.repository) {
		throw new Error(`unexpected missing repository, ${SUPPORTED_MESSAGE}`);
	}
	if (!payload.pull_request) {
		throw new Error(`unexpected missing pull_request, ${SUPPORTED_MESSAGE}`);
	}

	const owner = payload.repository.owner.login;
	const repo = payload.repository.name;
	const pr = payload.pull_request.number;

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
