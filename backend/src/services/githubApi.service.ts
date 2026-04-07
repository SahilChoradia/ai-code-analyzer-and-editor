import { HttpError } from "../middleware/errorHandler.js";

export interface GithubRepoListItem {
  name: string;
  fullName: string;
  description: string | null;
  visibility: "public" | "private";
  defaultBranch: string;
  htmlUrl: string;
}

function parseNextLink(link: string | null): string | null {
  if (!link) {
    return null;
  }
  for (const part of link.split(",")) {
    const m = /<([^>]+)>;\s*rel="next"/i.exec(part);
    if (m?.[1]) {
      return m[1].trim();
    }
  }
  return null;
}

/**
 * Lists repositories the token can access (paginated).
 */
export async function listUserGithubRepos(
  accessToken: string,
): Promise<GithubRepoListItem[]> {
  const out: GithubRepoListItem[] = [];
  let next: string | null =
    "https://api.github.com/user/repos?per_page=100&sort=updated&type=all";

  while (next) {
    const res = await fetch(next, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      throw new HttpError(
        502,
        `GitHub API returned ${res.status} while listing repositories`,
        "BAD_GATEWAY",
      );
    }

    const chunk = (await res.json()) as Array<{
      name: string;
      full_name: string;
      description: string | null;
      private: boolean;
      default_branch: string;
      html_url: string;
    }>;

    for (const r of chunk) {
      out.push({
        name: r.name,
        fullName: r.full_name,
        description: r.description,
        visibility: r.private ? "private" : "public",
        defaultBranch: r.default_branch,
        htmlUrl: r.html_url,
      });
    }

    next = parseNextLink(res.headers.get("link"));
  }

  return out;
}

/**
 * Confirms the repository exists and the token can access it (before clone).
 */
export async function assertGithubRepoAccessible(
  owner: string,
  repo: string,
  accessToken: string,
): Promise<void> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status === 404) {
    throw new HttpError(
      404,
      "Repository not found or you do not have access",
      "NOT_FOUND",
    );
  }

  if (!res.ok) {
    throw new HttpError(
      502,
      `GitHub API returned ${res.status}`,
      "BAD_GATEWAY",
    );
  }
}
