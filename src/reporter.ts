import * as core from '@actions/core';
import * as github from '@actions/github';

export enum State {
	ERROR = 'error',
	FAILURE = 'failure',
	PENDING = 'pending',
	SUCCESS = 'success',
};

const SUPPORTED_MESSAGE = 'action only supported for pull_request_review and pull_request triggers';

/**
 * Report a status check to GitHub.
 *
 * @param {State} state - The status to check
 * @param {string} description - Description for the status.
 */
export async function status( state: State, description: string ) {
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
	const req = {
		owner: payload.repository.owner.login,
		repo,
		sha: payload.pull_request.head.sha,
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
