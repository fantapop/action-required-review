import fs from 'fs';
import yaml from 'js-yaml';

import * as core from '@actions/core';
import Requirement, { isRequirements, RequirementConfig} from './requirement';
import {parseCodeowners } from './codeowners';
import { ReportError } from './github';

/**
 * Load the requirements yaml file.
 *
 * @returns {Requirement[]} Requirements.
 */
export function getRequirements(): Requirement[] {
	let enforceOnString = core.getInput('enforce-on');
	let enforceOnPaths: string[];

	if (!enforceOnString) {
		throw new ReportError(
			'Enforce On Config not found',
			new Error('`enforce-on` input is required'),
		);
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

	const filename = core.getInput('codeowners-path');
	if (!filename) {
		throw new ReportError(
			'Codeowners Path not found',
			new Error('`codeowners-path` input is required'),
		);
	}

	const trimmedFilename = filename.trim();

	let codeownersString
	try {
		codeownersString = fs.readFileSync(trimmedFilename, 'utf8');
	} catch (error) {
		throw new ReportError(
			`Requirements file ${trimmedFilename} could not be read`,
			error,
		);
	}

	try {
		return buildRequirements(codeownersString, enforceOnPaths);
	} catch (error) {
		throw new ReportError('Requirements are not valid', error);
	}
}

function buildName(requirement: RequirementConfig): string {
	return `PATH(${requirement.path}) => ${requirement.teams.join(" OR ")}`;
}

export function buildRequirements(codeownersString: string, enforceOnPaths: string[]): Requirement[] {
	let requirements: RequirementConfig[];

	core.info("Parsing Codeowners")
	requirements = parseCodeowners(codeownersString, enforceOnPaths);
	if (core.isDebug()) {
		core.debug("built requirements: " + requirements)
	}

	if (!Array.isArray(requirements)) {
		throw new Error(`Requirements file does not contain an array. Input: ${requirements}`);
	}

	return requirements.map((requirement, i) => new Requirement({
		name: buildName(requirement),
		...requirement,
	}));
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
			if (requirement.appliesToPath(path, matchedPaths)) {
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
