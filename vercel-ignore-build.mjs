const commitMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE || "";

if (commitMessage.includes("[skip vercel]")) {
  console.log("Skipping Vercel build: commit message contains [skip vercel].");
  process.exit(0);
}

console.log("Vercel build will run: commit message does not contain [skip vercel].");
process.exit(1);
