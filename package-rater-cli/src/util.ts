import { SimpleGit, simpleGit } from "simple-git";

export async function cloneRepository(url: string, dir: string): Promise<void> {
  const git: SimpleGit = simpleGit();
  await git.clone(url, dir, ["--depth", "1"]);
}
