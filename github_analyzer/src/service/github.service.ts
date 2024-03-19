import dayjs from "dayjs";
import { Octokit } from "@octokit/rest";
import { formatToTime } from "@lib/function/date";
import e from "express";

export enum PullRequestState {
  OPEN = "open",
  CLOSED = "closed",
  ALL = "all",
}

export enum PullRequestLabelName {
  QC_NOT_NEEDED = "QC 불필요",
  NEW_FEATURE = "신규기능",
  BUG_FIX = "오류수정",
  FEATURE_ENHANCEMENT = "기능개선",
  OTHER_CHANGE = "기타수정",
  MERGE_READY = "MergeReady",
  BLOCKING = "Block",
  DAY_ZERO = "D-0",
  DAY_ONE = "D-1",
  DAY_TWO = "D-2",
  DAY_THREE = "D-3",
  OVER_DAY = "OverDay",
}

interface User {
  url: string;
  login: string;
  id: number;
  avatar_url: string;
}

interface Label {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string;
}

interface PullRequest {
  url: string; // PR URL
  id: number; // PR ID
  html_url: string; // PR Page URL
  diff_url: string; // PR Diff URL
  number: number; // PR Number
  state: PullRequestState; // PR State
  title: string; // PR Title
  body: string; // PR Content
  labels: Label[]; // PR Labels
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
//
class GitHubService {
  owner: string;
  repo: string;
  labels: Array<Label>;
  octokit: Octokit;

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    this.labels = undefined;
    this.octokit = new Octokit();
  }

  // repository에 있는 설정된 라벨을 가져오는 함수
  async setRepoLabels() {
    try {
      const response = await this.octokit.request("GET /repos/{owner}/{repo}/labels", {
        owner: this.owner,
        repo: this.repo,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      });

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error("Error fetching repository labels");
      }

      this.labels = response.data as Array<Label>;
    } catch (error) {
      throw new Error(`Error fetching repository labels: ${error.message}`);
    }
  }

  async fetchPullRequests(filterOptions: {
    title?: RegExp;
    state?: PullRequestState;
    labelNames?: Array<PullRequestLabelName>;
  }): Promise<PullRequest[]> {
    const perPage = 100;
    let page = 1;
    let allPullRequests: PullRequest[] = [];

    // while (page <= 1) {
    while (true) {
      try {
        const response = await this.octokit.request("GET /repos/{owner}/{repo}/pulls", {
          owner: this.owner,
          repo: this.repo,
          state: filterOptions.state,
          per_page: perPage,
          page,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
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

    return this.filterPullRequests(allPullRequests, { title: filterOptions.title, labelNames: filterOptions.labelNames });
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

  filterPullRequests(pullRequests: PullRequest[], condition: { title?: RegExp; labelNames?: PullRequestLabelName[] }): PullRequest[] {
    let filteredPullRequests = pullRequests;

    if (condition.title) {
      filteredPullRequests = filteredPullRequests.filter((pullRequest) => condition.title.test(pullRequest.title));
    }

    if (condition.labelNames) {
      const filteredLabelIds = this.labels
        ?.filter((label) => condition.labelNames.includes(label.name as PullRequestLabelName))
        .map((label) => label.id);

      filteredPullRequests = filteredPullRequests.filter((pullRequest) => {
        const prLabelIds = pullRequest.labels.map((label) => label.id);

        return prLabelIds.every((id) => filteredLabelIds.includes(id));
      });
    }

    return filteredPullRequests;
  }

  async updateLabels(pullRequests: PullRequest[]) {
    let isRemove = false;

    await Promise.all(
      pullRequests.map(async (pr) => {
        const dDayLabelName = this.getDdayLabelName(pr);
        const mergeReadyLabelName = this.getMergeReadyLabelName(pr);
        const deployTypeLabelName = this.getDeployTypeLabelName(pr);
        const qcLabelName = this.getQCLabelName(pr);
        let isAdded = false;

        if (dDayLabelName || !mergeReadyLabelName) {
          if (dDayLabelName) {
            const dDay = this.getDday(dDayLabelName);

            if (dDay > 0 && dDay <= 3) {
              const newDdayLabel = `D-${dDay - 1}`;

              await this.addLabelsToPr(pr, [newDdayLabel as PullRequestLabelName]);
              isAdded = true;
            } else if (dDay <= 0) {
              await this.addLabelsToPr(pr, [PullRequestLabelName.OVER_DAY]);
              isAdded = true;
            }
          }

          if (!mergeReadyLabelName) {
            const isApproved = await this.isApproved(pr);

            if (isApproved) {
              await this.addLabelsToPr(pr, [PullRequestLabelName.MERGE_READY]);
              isAdded = true;
            }
          }

          if (isAdded) {
            await this.removeLabelsFromPr(pr, [dDayLabelName]);
          }
        }

        if (!deployTypeLabelName) {
          await this.addCommentToPr(pr, "배포 유형 라벨이 없습니다. 추가해주세요.");
        }

        if (!qcLabelName) {
          const comments = await this.getComments(pr);

          if (!comments.some((comment) => comment.body.includes("QC 라벨이 없습니다. 확인해주세요."))) {
            await this.addCommentToPr(pr, "QC 라벨이 없습니다. 확인해주세요.");
          }
        }
      })
    );
  }

  getDday(dDayLabelName: string): number {
    return Number(dDayLabelName.split("-")?.[1]);
  }

  getDdayLabelName(pr: PullRequest): PullRequestLabelName {
    const dDayLabels = [
      PullRequestLabelName.DAY_ZERO,
      PullRequestLabelName.DAY_ONE,
      PullRequestLabelName.DAY_TWO,
      PullRequestLabelName.DAY_THREE,
    ];

    return pr.labels.find((label) => dDayLabels.includes(label.name as PullRequestLabelName))?.name as PullRequestLabelName;
  }

  getMergeReadyLabelName(pr: PullRequest): PullRequestLabelName {
    return pr.labels.find((label) => label.name === PullRequestLabelName.MERGE_READY)?.name as PullRequestLabelName;
  }

  getDeployTypeLabelName(pr: PullRequest): PullRequestLabelName {
    const deployTypeLabels = [
      PullRequestLabelName.NEW_FEATURE,
      PullRequestLabelName.BUG_FIX,
      PullRequestLabelName.FEATURE_ENHANCEMENT,
      PullRequestLabelName.OTHER_CHANGE,
    ];

    return pr.labels.find((label) => deployTypeLabels.includes(label.name as PullRequestLabelName))?.name as PullRequestLabelName;
  }

  getQCLabelName(pr: PullRequest): PullRequestLabelName {
    return pr.labels.find((label) => label.name === PullRequestLabelName.QC_NOT_NEEDED)?.name as PullRequestLabelName;
  }

  async addLabelsToPr(pr: PullRequest, labelNames: PullRequestLabelName[]) {
    try {
      const response = await this.octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/labels", {
        owner: this.owner,
        repo: this.repo,
        issue_number: pr.number,
        labels: labelNames,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      });

      if (response.status !== 200) {
        throw new Error("Error adding labels to PR: status is not 200");
      }

      const repoLabelNames = response.data.map((e) => e.name);

      if (!labelNames.every((labelName) => repoLabelNames.includes(labelName as PullRequestLabelName))) {
        throw new Error("Error adding labels to PR: not all labels are added to PR");
      }
    } catch (error) {
      console.log(error);
      throw new Error(`Error adding labels to PR: ${error.message}`);
    }
  }

  async removeLabelsFromPr(pr: PullRequest, labelNames: PullRequestLabelName[]) {
    try {
      await Promise.all(
        labelNames.map(async (labelName) => {
          const response = await this.octokit.request("DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}", {
            owner: this.owner,
            repo: this.repo,
            issue_number: pr.number,
            name: labelName,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
              authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            },
          });

          if (response.status !== 200 || response.data.map((e) => e.name).includes(labelName)) {
            throw new Error("Error removing labels from PR");
          }
        })
      );
    } catch (error) {
      throw new Error(`Error removing labels from PR: ${error.message}`);
    }
  }

  async getComments(pr: PullRequest) {
    try {
      const response = await this.octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        owner: this.owner,
        repo: this.repo,
        issue_number: pr.number,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      });

      if (response.status !== 200) {
        throw new Error("Error fetching comments");
      }

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error("Error fetching comments");
      }

      return response.data;
    } catch (error) {
      throw new Error(`Error fetching comments: ${error.message}`);
    }
  }

  async addCommentToPr(pr: PullRequest, body: string) {
    try {
      const response = await this.octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        owner: this.owner,
        repo: this.repo,
        issue_number: pr.number,
        body,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      });

      if (response.status !== 201) {
        throw new Error("Error adding comment to PR");
      }
    } catch (error) {
      throw new Error(`Error adding comment to PR: ${error.message}`);
    }
  }

  async isApproved(pr: PullRequest): Promise<boolean> {
    try {
      const response = await this.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
        owner: this.owner,
        repo: this.repo,
        pull_number: pr.number,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
          authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      });

      if (response.status !== 200) {
        throw new Error("Error fetching reviews");
      }

      const reviews = response.data;

      return reviews.some((review: any) => review.state === "APPROVED");
    } catch (error) {
      throw new Error(`Error fetching reviews: ${error.message}`);
    }
  }

  /**
   * [🔍Review]
   * **Over Day**
   * - <${PR_1 URL} | ${replaceStringToEscapeString(PR_1 title)}>
   * - <${PR_2 URL} | ${replaceStringToEscapeString(PR_2 title)}>
   * - <${PR_3 URL} | ${replaceStringToEscapeString(PR_3 title)}>
   * - ...
   * **D-0**
   * - <${PR_1 URL} | ${replaceStringToEscapeString(PR_1 title)}>
   * - <${PR_2 URL} | ${replaceStringToEscapeString(PR_2 title)}>
   * - <${PR_3 URL} | ${replaceStringToEscapeString(PR_3 title)}>
   * - ...
   * **D-1**
   * - <${PR_1 URL} | ${replaceStringToEscapeString(PR_1 title)}>
   * - <${PR_2 URL} | ${replaceStringToEscapeString(PR_2 title)}>
   * - <${PR_3 URL} | ${replaceStringToEscapeString(PR_3 title)}>
   * - ...
   * **D-2**
   * - <${PR_1 URL} | ${replaceStringToEscapeString(PR_1 title)}>
   * - <${PR_2 URL} | ${replaceStringToEscapeString(PR_2 title)}>
   * - <${PR_3 URL} | ${replaceStringToEscapeString(PR_3 title)}>
   * - ...
   * **D-3**
   * - <${PR_1 URL} | ${replaceStringToEscapeString(PR_1 title)}>
   * - <${PR_2 URL} | ${replaceStringToEscapeString(PR_2 title)}>
   * - <${PR_3 URL} | ${replaceStringToEscapeString(PR_3 title)}>
   * - ...
   *
   * [🧱Block]
   * - <${PR_1 URL} | ${replaceStringToEscapeString(PR_1 title)}>
   * - <${PR_2 URL} | ${replaceStringToEscapeString(PR_2 title)}>
   * - <${PR_3 URL} | ${replaceStringToEscapeString(PR_3 title)}>
   * - ...
   *
   * [🚀Merge Ready]
   * - <${PR_1 URL} | ${replaceStringToEscapeString(PR_1 title)}>
   * - <${PR_2 URL} | ${replaceStringToEscapeString(PR_2 title)}>
   * - <${PR_3 URL} | ${replaceStringToEscapeString(PR_3 title)}>
   * - ...
   *
   */
  // Test 해보기
  generateNotificationMessage(pullRequests: PullRequest[]): string {
    const overDayPRs = pullRequests.filter((pr) => pr.labels.some((label) => label.name === PullRequestLabelName.OVER_DAY));
    const dDayPRs = pullRequests.filter((pr) => pr.labels.some((label) => label.name.includes("D-")));
    const blockPRs = pullRequests.filter((pr) => pr.labels.some((label) => label.name === PullRequestLabelName.BLOCKING));
    const mergeReadyPRs = pullRequests.filter((pr) => pr.labels.some((label) => label.name === PullRequestLabelName.MERGE_READY));

    let message = "";

    // Review
    if (overDayPRs.length > 0) {
      message += `**Over Day**\n${overDayPRs.map((pr) => `- <${pr.html_url} | ${pr.title}>`).join("\n")}\n\n`;
    }

    if (dDayPRs.length > 0) {
      // d-0, d-1, d-2, d-3 순으로 message를 생성합니다.
      for (let i = 0; i < 4; i++) {
        const dDayPRs = pullRequests.filter((pr) => pr.labels.some((label) => label.name === `D-${i}`));
        if (dDayPRs.length > 0) {
          message += `**D-${i}**\n${dDayPRs.map((pr) => `- <${pr.html_url} | ${pr.title}>`).join("\n")}\n\n`;
        }
      }
    }

    if (message.length > 0) {
      message = `[🔍Review]\n${message}`;
    }

    // Block
    if (blockPRs.length > 0) {
      message += `[🧱Block]\n${blockPRs.map((pr) => `- <${pr.html_url} | ${pr.title}>`).join("\n")}\n\n`;
    }

    // Merge Ready
    if (mergeReadyPRs.length > 0) {
      message += `[🚀Merge Ready]\n${mergeReadyPRs.map((pr) => `- <${pr.html_url} | ${pr.title}>`).join("\n")}\n\n`;
    }

    return message;
  }
}

export default GitHubService;
