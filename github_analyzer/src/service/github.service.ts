import dayjs from "dayjs";
import { Octokit } from "@octokit/rest";
import { formatToTime } from "@lib/function/date";

interface User {
  url: string;
  login: string;
  id: number;
  avatar_url: string;
}

interface PullRequest {
  url: string; // PR URL
  id: number; // PR ID
  html_url: string; // PR Page URL
  diff_url: string; // PR Diff URL
  number: number; // PR Number
  state: "open" | "closed";
  title: string; // PR Title
  body: string; // PR Content
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  assignee: User;
  assignees: User[];
  requested_reviewers: User[];
  requested_teams: any[];
  draft: boolean;
  user: User;
}

class GitHubService {
  owner: string;
  repo: string;
  octokit: Octokit;

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit();
  }

  //OPTIONS Param으로 개선
  async fetchPullRequests(options: { state: "open" | "closed";  }): Promise<PullRequest[]> {
    const perPage = 100;
    let page = 1;
    let allPullRequests: PullRequest[] = [];

    // while (page <= 1) {
    while (true) {
      try {
        const response = await this.octokit.request("GET /repos/{owner}/{repo}/pulls", {
          owner: this.owner,
          repo: this.repo,
          state: options.state,

          per_page: perPage,
          page,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
          },
        });

        const pullRequests = response.data as PullRequest[];

        console.log("pullRequests.length, page, per_page: ", pullRequests.length, page, perPage);
        allPullRequests = allPullRequests.concat(pullRequests);

        if (pullRequests.length < perPage) {
          console.log("allPullRequests.length", allPullRequests.length);
          break;
        }

        ++page;
      } catch (error) {
        throw new Error(`Error fetching pull requests: ${error.message}`);
      }
    }

    const pattern = /\[(DOCS|docs)-[0-9]{1,}\]/;
    const filteredPullRequests = allPullRequests.filter((pullRequest) => pattern.test(pullRequest.title));

    return filteredPullRequests;
  }

  calculateReviewTime(startDate: string, endDate: string, unit: "hour" | "seconds"): number {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    return end.diff(start, unit);
  }

  getReviewTimes(pullRequests: PullRequest[]): number[] {
    const reviewTimes: number[] = [];

    pullRequests.forEach((pr: PullRequest) => {
      const endDate = pr.merged_at || pr.closed_at;

      if (pr.state !== "closed" || !endDate) return;

      reviewTimes.push(this.calculateReviewTime(pr.created_at, endDate, "seconds"));
    });

    return reviewTimes;
  }

  getReviewRange(pullRequests: PullRequest[]): { start: string; end: string } {
    let minDate = dayjs();
    let maxDate = dayjs(0); // 초기값을 가장 늦은 날짜로 설정

    pullRequests.forEach((pr: PullRequest) => {
      const createdAt = dayjs(pr.created_at);
      const updatedAt = dayjs(pr.merged_at || pr.closed_at);

      if (createdAt.isBefore(minDate)) {
        minDate = createdAt;
      }
      if (updatedAt.isAfter(maxDate)) {
        maxDate = updatedAt;
      }
    });

    return { start: minDate.format("YYYY/MM/DD"), end: maxDate.format("YYYY/MM/DD") };
  }

  getReviewTimeStatisticsByPr(pullRequests: PullRequest[]): {
    reviewRange: string;
    average: string;
    min: string;
    max: string;
  } {
    const reviewTimes = this.getReviewTimes(pullRequests);
    const reviewRange = this.getReviewRange(pullRequests);
    const totalTime = reviewTimes.reduce((acc, cur) => acc + cur, 0);
    const averageTime = reviewTimes.length > 0 ? totalTime / reviewTimes.length : 0;
    const minTime = Math.min(...reviewTimes);
    const maxTime = Math.max(...reviewTimes);

    return {
      reviewRange: `${reviewRange.start} ~ ${reviewRange.end}`,
      average: formatToTime(averageTime),
      min: formatToTime(minTime),
      max: formatToTime(maxTime),
    };
  }
}

export default GitHubService;
