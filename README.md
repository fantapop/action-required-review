# GitHub Required Review Check

This [Github Action](https://github.com/features/actions) will check that
required reviewers have accepted the PR, setting a status check accordingly. Required reviewers are taken from the CODEOWNERS file in the repo.

To require a review on a CODEOWNERS path, list that path in the enforce-on
configuration value for this action.  This provides the ability to both use
CODEOWNERS as a list of who gets added to a review but also to optionally
enforce reviews on some of those paths.  The current functionality offered by
Github is only to force reviews for all paths in CODEOWNERS or none of them.

The enforced paths must be listed exactly in the enforce-on configuration option
mentioned above.  Any paths which are not listed in that array will not be
enforced by this action.  They will serve only the normal CODEOWNERS
functionality which is to automatically at that team or user to the review.

All enforced paths in the CODEOWNERS that show up in a PR will require a reviewer from those teams.  A single person who spans multiple teams can satisfy multiple separate requirements.

## Example

```yaml
name: Required review check
on:
  pull_request_review:
  pull_request:
    types: [ opened, reopened, synchronize ]

# The set of required permissions.  This block will scope down the default
# GITHUB_TOKEN
permissions:
  contents: read
  pull-requests: read
  statuses: write

jobs:
  check:
    name: Checking required reviews
    runs-on: ubuntu-latest

    # GitHub should provide a "pull_request_review_target", but they don't and
    # the action will fail if run on a forked PR.
    if: github.event.pull_request.head.repo.full_name == github.event.pull_request.base.repo.full_name

    steps:
      # check out the repo to get access to the CODEOWNERS file
      - uses: actions/checkout@v3
      - uses: fantapop/action-required-review
        with:
          # Specify which paths from the CODEOWNERS file to enforce as review
          # requirements.  The CODEOWNERS file will dictate the teams and users
          # associated with a path. Any review reviewer listed in a team or
          # directly can satisfy the requirement. Paths must match the path in
          # the CODEOWNERS file exactly.  Paths without teams or users listed
          # remove a requirement found higher up in the file. These paths must
          # also be added to the enforce-on array to take affect.
          enforce-on:
            - 'docs/'
            - 'path2/file.txt'

          # Specify the "context" for the status to set. This is what shows up
          # in the PR's checks list.
          status: Required review

          # By default, 'review required' statuses will be set to pending. Set
          # this to instead fail the status checks instead of leaving them pending.
          fail: true

          # GitHub Access Token. The user associated with this token will show up
          # as the "creator" of the status check, and must have access to read
          # pull request data, create status checks (`repo:status`), and to read
          # your organization's teams (`read:org`).
          token: ${{ secrets.GITHUB_TOKEN }}
```
