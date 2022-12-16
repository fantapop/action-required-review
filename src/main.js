const core = require('@actions/core');
const { getRequirements, satisfiesAllRequirements } = require('./main-helper'); 
const reporter = require('./reporter.js');

/**
 * Action entry point.
 */
async function main() {
	try {
		const requirements = getRequirements();
		core.startGroup(`Loaded ${requirements.length} review requirement(s)`);

		const reviewers = await require('./reviewers.js')();
		core.startGroup(`Found ${reviewers.length} reviewer(s)`);
		reviewers.forEach(reviewer => core.info(reviewer));
		core.endGroup();

		const paths = await require('./paths.js')();
		core.startGroup(`PR affects ${paths.length} file(s)`);
		paths.forEach(path => core.info(path));
		core.endGroup();

		if (await satisfiesAllRequirements(requirements, paths, reviewers)) {
			await reporter.status(reporter.STATE_SUCCESS, 'All required reviews have been provided!');
		} else {
			await reporter.status(
				core.getBooleanInput('fail') ? reporter.STATE_FAILURE : reporter.STATE_PENDING,
				reviewers.length ? 'Awaiting more reviews...' : 'Awaiting reviews...'
			);
		}
	} catch (error) {
		let err, state, description;
		if (error instanceof reporter.ReportError) {
			err = error.cause();
			state = reporter.STATE_FAILURE;
			description = error.message;
		} else {
			err = error;
			state = reporter.STATE_ERROR;
			description = 'Action encountered an error';
		}
		core.setFailed(err.message);
		core.info(err.stack);
		if (core.getInput('token') && core.getInput('status')) {
			await reporter.status(state, description);
		}
	}
}

main();
