import * as core from '@actions/core';
import { getRequirements, satisfiesAllRequirements } from './main-helper';
import { fetchReviewers, fetchPaths, State, status as reportStatus, ReportError } from './github';

/**
 * Action entry point.
 */
async function main() {
	try {
		const requirements = getRequirements();
		core.startGroup(`Loaded ${requirements.length} review requirement(s)`);

		const reviewers = await fetchReviewers();
		core.startGroup(`Found ${reviewers.length} reviewer(s)`);
		reviewers.forEach(reviewer => core.info(reviewer));
		core.endGroup();

		const paths = await fetchPaths();
		core.startGroup(`PR affects ${paths.length} file(s)`);
		paths.forEach(path => core.info(path));
		core.endGroup();

		if (await satisfiesAllRequirements(requirements, paths, reviewers)) {
			await reportStatus(State.SUCCESS, 'All required reviews have been provided!');
		} else {
			await reportStatus(
				core.getBooleanInput('fail') ? State.FAILURE : State.PENDING,
				reviewers.length ? 'Awaiting more reviews...' : 'Awaiting reviews...'
			);
		}
	} catch (error) {
		let err, state, description;
		if (error instanceof ReportError) {
			err = error.cause();
			state = State.FAILURE;
			description = error.message;
		} else {
			err = error;
			state = State.ERROR;
			description = 'Action encountered an error';
		}
		core.setFailed(String(err));
		const stack = (err as Error).stack;
		if (stack) {
			core.info(stack);
		}
		if (core.getInput('token') && core.getInput('status')) {
			await reportStatus(state, description);
		}
	}
}

main();
