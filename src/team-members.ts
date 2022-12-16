import * as core from '@actions/core';
import * as github from '@actions/github';

const cache: {[key:string]: string[]} = {};

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

	if ( cache[ team ] ) {
		return cache[ team ];
	}

	const octokit = github.getOctokit( core.getInput( 'token', { required: true } ) );
	const org = github.context.payload.repository?.owner.login;

	if (!org) {
		throw new Error('repository not found in payload');
	}

	let members: string[] = [];
	try {
		for await ( const res of octokit.paginate.iterator( octokit.rest.teams.listMembersInOrg, {
			org: org,
			team_slug: team,
			per_page: 100,
		} ) ) {
			members = members.concat( res.data.map( v => v.login ) );
		}
	} catch ( error ) {
		throw new Error(`Failed to query ${ org } team ${ team } from GitHub: ${error}` );
	}

	cache[ team ] = members;
	return members;
}
