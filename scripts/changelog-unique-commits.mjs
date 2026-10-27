import githubChangelog from "@changesets/changelog-github";

function uniqueByCommit(changesets) {
  const seen = new Set();
  return changesets.filter((changeset) => {
    const key = changeset.commit ?? changeset.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function withUniqueCommits(base) {
  return {
    getReleaseLine: base.getReleaseLine,
    getDependencyReleaseLine: (changesets, dependenciesUpdated, options) =>
      base.getDependencyReleaseLine(uniqueByCommit(changesets), dependenciesUpdated, options),
  };
}

export { uniqueByCommit, withUniqueCommits };
export default withUniqueCommits(githubChangelog);
