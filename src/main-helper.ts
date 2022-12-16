import fs from 'fs';
import yaml from 'js-yaml';

import * as core from '@actions/core';
import * as reporter from './reporter';
import Requirement, { isRequirements, RequirementConfig} from './requirement';
import {parseCodeowners } from './codeowners';

// https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners#codeowners-file-location
const VALID_CODEOWNERS_PATHS = [
	'CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS',
];

/**
 * Load the requirements yaml file.
 *
 * @returns {Requirement[]} Requirements.
 */
export function getRequirements(): Requirement[] {
	let requirementsString = core.getInput('requirements');
	let enforceOnString = core.getInput('enforce-on');
	let isCodeowners = false;
	let enforceOnPaths: string[];

	if (!enforceOnString) {
		enforceOnPaths = [];
	} else {

		const enforceOnPathsLoaded = yaml.load(enforceOnString, {
			onWarning: w => core.warning(`Yaml: ${w.message}`),
		});

		if (!Array.isArray(enforceOnPathsLoaded)) {
			throw new Error('enforce-on should be an array');
		}
		else {
			enforceOnPaths = enforceOnPathsLoaded;
		}
		if (core.isDebug()) {
			core.debug("using enforce-on list: " + JSON.stringify(enforceOnPaths))
		}
	}


	if (!requirementsString) {
		const filename = core.getInput('requirements-file');
		if (!filename) {
			throw new reporter.ReportError(
				'Requirements are not found',
				new Error('Either `requirements` or `requirements-file` input is required'),
			);
		}

		const trimmedFilename = filename.trim();

		if (VALID_CODEOWNERS_PATHS.includes(trimmedFilename)) {
			isCodeowners = true;
		}

		try {
			core.info('working directory is: ' + process.cwd())
			core.info('ls .: ' + fs.readdirSync('.'))
			requirementsString = fs.readFileSync(trimmedFilename, 'utf8');
		} catch (error) {
			throw new reporter.ReportError(
				`Requirements file ${trimmedFilename} could not be read`,
				error,
			);
		}
	} else if (core.getInput('requirements-file')) {
		core.warning('Ignoring input `requirements-file` because `requirements` was given');
	}

	try {
		return buildRequirements(requirementsString, isCodeowners, enforceOnPaths);
	} catch (error) {
		throw new reporter.ReportError('Requirements are not valid', error);
	}
}

export function buildRequirements(requirementsString: string, isCodeowners: boolean, enforceOnPaths: string[]): Requirement[] {
	let requirements: RequirementConfig[];

	if (isCodeowners) {
		core.info("Parsing Codeowners")
		requirements = parseCodeowners(requirementsString, enforceOnPaths);
	}
	else {
		core.info("Parsing Yaml")
		const requirementsUnverified = yaml.load(requirementsString, {
			onWarning: w => core.warning(`Yaml: ${w.message}`),
		});
		if (isRequirements(requirementsUnverified)) {
			requirements = requirementsUnverified;
		}
		else {
			throw new Error("Yaml requirements: invalid format");
		}
	}
	core.debug("read requirements: " + requirements)

	if (!Array.isArray(requirements)) {
		throw new Error(`Requirements file does not contain an array. Input: ${requirements}`);
	}

	return requirements.map((r, i) => new Requirement({ name: `#${i}`, ...r }));
}

export async function satisfiesAllRequirements(requirements: Requirement[], paths: string[], reviewers: string[]): Promise<boolean> {
	const matchedPaths: string[] = [];
	let satisfied = true;

	// currently, checking if each requirement is satisfied. This doesn't work
	// well with the CODEOWNERS format because each requirement maps to a rule
	// and only the final matching rule for a path should apply.

	// instead of looping per requirement, I'm going to try reversing the list
	// of requirements and then looping per path to find the first requirement
	// that applies
	PATH: for (const path of paths) {
		// loop through requirements backwards since the last matching one
		// should apply
		for (let i = requirements.length - 1; i >= 0; i--) {
			const requirement = requirements[i];
			if (requirement.appliesToPaths([path], matchedPaths)) {
				if (await requirement.isSatisfied(reviewers)) {
					core.info(`Requirement ${requirement.name} applies to "${path}": satisfied`);
				}
				else {
					core.info(`Requirement ${requirement.name} applies to "${path}": not satisfied`);
					satisfied = false;
				}
				continue PATH;
			}
		}
		core.info(`No requirements apply to "${path}"`);
	}

	return satisfied;
}
