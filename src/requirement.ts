import * as core from '@actions/core'
import assert from 'assert';
import picomatch from 'picomatch';

import { fetchTeamMembers } from './team-members';

export enum RequirementOperation {
	allOf = 'all-of',
	anyOf = 'any-of',
}

type TeamConfig = string | {[key in RequirementOperation]?: string[]} | string[];

export interface RequirementConfig {
	name?: string;
	teams: string[];
	paths: 'unmatched' | [string, ...string[]];
}


class RequirementError extends Error {
	constructor(message: string, extra: {config: any, value?: any}) {
		super(message);
		Object.setPrototypeOf(this, RequirementError.prototype);
	}
}

/**
 * Prints a result set, then returns it.
 *
 * @param {string} label - Label for the set.
 * @param {string[]} items - Items to print. If an empty array, will print `<empty set>` instead.
 * @returns {string[]} `items`.
 */
function printSet( label: string, items: string[] ): string[] {
	core.info( label + ' ' + ( items.length ? items.join( ', ' ) : '<empty set>' ) );
	return items;
}

/**
 * Build a reviewer team membership filter.
 *
 * @param {object} config - Requirements configuration object being processed.
 * @param {Array|string|object} teamConfig - Team name, or single-key object with a list of teams/objects, or array of such.
 * @param {string} indent - String for indentation.
 * @returns {Function} Function to filter an array of reviewers by membership in the team(s).
 */
function buildReviewerFilter( config: RequirementConfig , teamConfig: TeamConfig, indent: string ): ReviewerFilter {
	if ( typeof teamConfig === 'string' ) {
		const team = teamConfig;
		return async function ( reviewers ) {
			const members = await fetchTeamMembers( team );
			return printSet(
				`${ indent }Members of ${ team }:`,
				reviewers.filter( reviewer => members.includes( reviewer ) )
			);
		};
	}

	if (Array.isArray(teamConfig) ) {
		throw new Error('teamConfig must not be an array at this point');
	}

	let operation: RequirementOperation | undefined
	try {
		const keys = Object.keys( teamConfig );
		assert( keys.length === 1 );
		if (RequirementOperation.allOf === keys[0] || RequirementOperation.anyOf === keys[0]) {
			operation = keys[0];
		}
		else {
			throw new RequirementError( 'operation must be all-of or any-of', {
				config,
				value: teamConfig,
			});
		}
	} catch {
		throw new RequirementError( 'Expected a team name or a single-keyed object.', {
			config,
			value: teamConfig,
		});
	}

	let teams: string[] | undefined = teamConfig[ operation ];
	let reviewerFilters: ReviewerFilter[] = [];

	switch ( operation ) {
		case 'any-of':
		case 'all-of':
			// These ops require an array of teams/objects.
			if ( ! Array.isArray( teams ) ) {
				throw new RequirementError( `Expected an array of teams, got ${ typeof teams }`, {
					config: config,
					value: teams,
				} );
			}
			reviewerFilters = teams.map( team => buildReviewerFilter( config, team, `${indent}  ` ) );
			break;

		default:
			throw new RequirementError( `Unrecognized operation "${ operation }"`, {
				config: config,
				value: teamConfig,
			} );
	}

	if ( operation === 'any-of' ) {
		return async function ( reviewers ) {
			core.info( `${ indent }Union of these:` );
			return printSet( `${ indent }=>`, [
				...new Set(
					( await Promise.all( reviewerFilters.map( filter => filter( reviewers) ) ) ).flat( 1 )
				),
			] );
		};
	}

	if ( operation === 'all-of' ) {
		return async function ( reviewers ) {
			core.info( `${ indent }Union of these, if none are empty:` );
			const filtered = await Promise.all( reviewerFilters.map( filter => filter( reviewers) ) );
			if ( filtered.some( a => a.length === 0 ) ) {
				return printSet( `${ indent }=>`, [] );
			}
			return printSet( `${ indent }=>`, [ ...new Set( filtered.flat( 1 ) ) ] );
		};
	}

	throw new RequirementError( `Unrecognized operation "${ operation }"`, {
		config: config,
		value: teamConfig,
	} );
}

function isRequirement(req: unknown): req is RequirementConfig {
	const maybeRequirementConfig = req as RequirementConfig;
	return maybeRequirementConfig.teams &&
		Array.isArray(maybeRequirementConfig.teams) &&
		maybeRequirementConfig.paths && 
		Array.isArray(maybeRequirementConfig.paths);
}

export function isRequirements(reqs: unknown): reqs is RequirementConfig[] {
	return Array.isArray(reqs) && reqs.every(isRequirement);
}

type ReviewerFilter = (reviewers: string[]) => Promise<string[]>;

interface NegatableFilter {
	negated: boolean;
	filter: ReturnType<typeof picomatch>;
}

/**
 * Class representing an individual requirement.
 */
export default class Requirement {

	name: string;
	teams: string[];
	pathsFilter: null | ((path: string) => boolean);
	reviewerFilter?: ReviewerFilter;

	/**
	 * Constructor.
	 *
	 * @param {object} config - Object config
	 * @param {string[]|string} config.paths - Paths this requirement applies to. Either an array of picomatch globs, or the string "unmatched".
	 * @param {Array} config.teams - Team reviews requirements.
	 */
	constructor( config: RequirementConfig ) {
		this.name = config.name || 'Unnamed requirement';
		this.teams = config.teams;

		if ( config.paths === 'unmatched' ) {
			this.pathsFilter = null;
		} else if (
			Array.isArray( config.paths ) &&
			config.paths.length > 0 &&
			config.paths.every( v => typeof v === 'string' )
		) {
			// picomatch doesn't combine multiple negated patterns in a way that makes sense here: `!a` and `!b` will pass both `a` and `b`
			// because `a` matches `!b` and `b` matches `!a`. So instead we have to handle the negation ourself: test the (non-negated) patterns in order,
			// with the last match winning. If none match, the opposite of the first pattern's negation is what we need.
			const filters = config.paths.map( path => {
				if ( path.startsWith( '!' ) ) {
					return {
						negated: true,
						filter: picomatch( path.substring( 1 ), { dot: true, nonegate: true } ),
					};
				}
				core.info('Creating picomatch filter for path: ' + path)
				return {
					negated: false,
					filter: picomatch( path, { dot: true } ),
				};
			} );

			const first = filters.shift();

			if (!first) {
				throw new RequirementError("there must be at least one path", { config });
			}

			this.pathsFilter = v => {
				let ret = first.filter( v ) ? ! first.negated : first.negated;
				for ( const filter of filters ) {
					if ( filter.filter( v ) ) {
						ret = ! filter.negated;
					}
				}
				return ret;
			};
		} else {
			throw new RequirementError(
				'Paths must be a non-empty array of strings, or the string "unmatched".',
				{
					config,
				},
			);
		}

		// allow requirements with 0 teams to better support the github
		// CODEOWNERS file functionality which allows negating matches by
		// letting them have no associated teams or users.
		if (this.teams.length !== 0) {
			const teamConfig: TeamConfig = { [RequirementOperation.anyOf]: config.teams };
			this.reviewerFilter = buildReviewerFilter( config, teamConfig, '  ' );
		}
	}

	/**
	 * Test whether this requirement applies to the passed paths.
	 *
	 * @param {string[]} paths - Paths to test against.
	 * @param {string[]} matchedPaths - Paths that have already been matched. Will be modified if true is returned.
	 * @returns {boolean} Whether the requirement applies.
	 */
	appliesToPaths( paths: string[], matchedPaths: string[] ): boolean {
		let matches;
		const pathsFilter = this.pathsFilter;
		if ( pathsFilter ) {
			matches = paths.filter( path => pathsFilter( path ) );
		} else {
			// matchedPaths kept around to support the unmatched special value
			core.info('matched paths is being consulted');
			matches = paths.filter( path => ! matchedPaths.includes( path ) );
			if ( matches.length === 0 ) {
				core.info( "Matches files that haven't been matched yet, but all files have." );
			}
		}

		if ( matches.length !== 0 ) {
			core.info( 'Matches the following files:' );
			matches.forEach( match => core.info( `   - ${ match }` ) );
			matchedPaths.push( ...matches.filter( path => ! matchedPaths.includes( path ) ) );
			matchedPaths.sort();
		}

		return matches.length !== 0;
	}

	/**
	 * Test whether this requirement is satisfied.
	 *
	 * @param {string[]} reviewers - Reviewers to test against.
	 * @returns {boolean} Whether the requirement is satisfied.
	 */
	async isSatisfied( reviewers: string[] ): Promise<boolean> {
		if (this.teams.length === 0) {
			core.info( 'Requirement has no reviewers' );
			return true;
		}
		else if (this.reviewerFilter) {
			core.info( 'Checking reviewers...' );
			return ( await this.reviewerFilter( reviewers ) ).length > 0;
		}
		else {
			throw new Error('reviewerFilter unexpectedly undefined');
		}
	}
}
