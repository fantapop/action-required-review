const fs = require('fs');
const core = require('@actions/core');
const yaml = require('js-yaml');
const reporter = require('./reporter.js');
const Requirement = require('./requirement.js');
const parseCodeOwners = require('./codeowners.js');

// https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners#codeowners-file-location
const VALID_CODEOWNERS_PATHS = [
	'CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS',
];

/**
 * Load the requirements yaml file.
 *
 * @returns {Requirement[]} Requirements.
 */
function getRequirements() {
	let requirementsString = core.getInput('requirements');
	let enforceOnString = core.getInput('enforce_on');
	let isCodeowners = false;
	let enforceOn = false;

	if (!enforceOnString) {
		enforceOn = [];
	} else {

		enforceOn = yaml.load(enforceOnString, {
			onWarning: w => core.warning(`Yaml: ${w.message}`),
		});

		if (!Array.isArray(enforceOn)) {
			throw new Error('enforce_on should be an array');
		}

	}


	if (!requirementsString) {
		const filename = core.getInput('requirements-file');
		if (!filename) {
			throw new reporter.ReportError(
				'Requirements are not found',
				new Error('Either `requirements` or `requirements-file` input is required'),
				{}
			);
		}

		const trimmedFilename = filename.trim();

		if (VALID_CODEOWNERS_PATHS.includes(trimmedFilename)) {
			isCodeowners = true
		}

		try {
			core.info('working directory is: ' + process.cwd())
			core.info('ls .: ' + fs.readdirSync('.'))
			requirementsString = fs.readFileSync(trimmedFilename, 'utf8');
		} catch (error) {
			throw new reporter.ReportError(
				`Requirements file ${trimmedFilename} could not be read`,
				error,
				{}
			);
		}
	} else if (core.getInput('requirements-file')) {
		core.warning('Ignoring input `requirements-file` because `requirements` was given');
	}

	var requirements = []
	try {
		if (isCodeowners) {
			core.info("Parsing Codeowners")
			requirements = parseCodeOwners(requirementsString, enforceOn);
		}
		else {
			core.info("Parsing Yaml")
			requirements = yaml.load(requirementsString, {
				onWarning: w => core.warning(`Yaml: ${w.message}`),
			});
		}
		core.debug("read requirements: ", requirements)

		if (!Array.isArray(requirements)) {
			throw new Error(`Requirements file does not contain an array. Input: ${requirements}`);
		}

		return requirements.map((r, i) => new Requirement({ name: `#${i}`, ...r }));

	} catch (error) {

		error[Symbol.toStringTag] = 'Error'; // Work around weird check in WError.
		throw new reporter.ReportError('Requirements are not valid', error, {});

	}
}

/**
 * Action entry point.
 */
async function main() {
	try {
		const requirements = getRequirements();
		core.startGroup(`Loaded ${requirements.length} review requirement(s)`);

		const reviewers = await require('./reviewers.js')();
		core.startGroup(`Found ${reviewers.length} reviewer(s)`);
		reviewers.forEach(r => core.info(r));
		core.endGroup();

		const paths = await require('./paths.js')();
		core.startGroup(`PR affects ${paths.length} file(s)`);
		paths.forEach(p => core.info(p));
		core.endGroup();

		const matchedPaths = [];
		let ok = true;
		for (let i = 0; i < requirements.length; i++) {
			const r = requirements[i];
			core.startGroup(`Checking requirement "${r.name}"...`);
			if (!r.appliesToPaths(paths, matchedPaths)) {
				core.endGroup();
				core.info(`Requirement "${r.name}" does not apply to any files in this PR.`);
			} else if (await r.isSatisfied(reviewers)) {
				core.endGroup();
				core.info(`Requirement "${r.name}" is satisfied by the existing reviews.`);
			} else {
				ok = false;
				core.endGroup();
				core.error(`Requirement "${r.name}" is not satisfied by the existing reviews.`);
			}
		}
		if (ok) {
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
