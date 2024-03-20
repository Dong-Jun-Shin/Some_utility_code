import dayjs from "dayjs";
import { Octokit } from "@octokit/rest";
import { formatToTime } from "@lib/function/date";
import { cloneDeep } from "lodash";
import { Block, SlackTemplate, Template } from "@lib/template/slack.template";

export enum JiraProject {
  MavenDocs = "DOCS",
}

export enum PullRequestState {
  Open = "open",
  Closed = "closed",
  All = "all",
}

export enum PullRequestLabelName {
  QcNotNeeded = "QC 불필요",
  NewFeature = "신규기능",
  BugFix = "오류수정",
  FeatureEnhancement = "기능개선",
  OtherChange = "기타수정",
  MergeReady = "MergeReady",
  Blocking = "Block",
  DayZero = "D-0",
  DayOne = "D-1",
  DayTwo = "D-2",
  DayThree = "D-3",
  OverDay = "OverDay",
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

const JIRA_PROJECT_CASES = Object.values(JiraProject)
  .map(
    (project) => project.toLocaleUpperCase() + "|" + project.toLocaleLowerCase()
  )
  .join("|");
const JIRA_REG_EXP = new RegExp(`\\[(${JIRA_PROJECT_CASES})-[0-9]{1,}\\]`);
const NON_JIRA_REG_EXP = new RegExp(`\\[.*-[0-9]{1,}\\]`);

export default class GitHubRepoService {
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
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/labels",
        {
          owner: this.owner,
          repo: this.repo,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          },
        }
      );

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

    while (true) {
      try {
        const response = await this.octokit.request(
          "GET /repos/{owner}/{repo}/pulls",
          {
            owner: this.owner,
            repo: this.repo,
            state: PullRequestState.All,
            per_page: perPage,
            page,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
              authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            },
          }
        );

        const pullRequests = response.data as PullRequest[];

        console.log(
          "pullRequests.length, page, per_page: ",
          pullRequests.length,
          page,
          perPage
        );
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

    return this.filterFechedPullRequests(allPullRequests, {
      title: filterOptions.title,
      state: filterOptions.state,
      labelNames: filterOptions.labelNames,
    });
  }

  calculateReviewTime(
    startDate: string,
    endDate: string,
    unit: "hour" | "seconds"
  ): number {
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    return end.diff(start, unit);
  }

  getReviewTimes(pullRequests: PullRequest[]): number[] {
    const reviewTimes: number[] = [];

    pullRequests.forEach((pr: PullRequest) => {
      const endDate = pr.merged_at || pr.closed_at;

      if (pr.state !== "closed" || !endDate) return;

      reviewTimes.push(
        this.calculateReviewTime(pr.created_at, endDate, "seconds")
      );
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

    return {
      start: minDate.format("YYYY/MM/DD"),
      end: maxDate.format("YYYY/MM/DD"),
    };
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
    const averageTime =
      reviewTimes.length > 0 ? totalTime / reviewTimes.length : 0;
    const minTime = Math.min(...reviewTimes);
    const maxTime = Math.max(...reviewTimes);

    return {
      reviewRange: `${reviewRange.start} ~ ${reviewRange.end}`,
      average: formatToTime(averageTime),
      min: formatToTime(minTime),
      max: formatToTime(maxTime),
    };
  }

  filterFechedPullRequests(
    pullRequests: PullRequest[],
    condition: {
      title?: RegExp;
      state?: PullRequestState;
      labelNames?: PullRequestLabelName[];
    }
  ): PullRequest[] {
    let filteredPullRequests = pullRequests;

    if (condition.title) {
      filteredPullRequests = filteredPullRequests.filter((pullRequest) =>
        condition.title.test(pullRequest.title)
      );
    }

    if (condition.state) {
      filteredPullRequests = filteredPullRequests.filter(
        (pullRequest) => pullRequest.state === condition.state
      );
    }

    if (condition.labelNames) {
      const filteredLabelIds = this.labels
        ?.filter((label) =>
          condition.labelNames.includes(label.name as PullRequestLabelName)
        )
        .map((label) => label.id);

      filteredPullRequests = filteredPullRequests.filter((pullRequest) => {
        const prLabelIds = pullRequest.labels.map((label) => label.id);

        return prLabelIds.every((id) => filteredLabelIds.includes(id));
      });
    }

    return filteredPullRequests;
  }

  async updateLabels(pullRequests: PullRequest[]) {
    await Promise.all(
      pullRequests.map(async (pr) => {
        const blockingLabelName = this.getBlockingLabelName(pr);
        const mergeReadyLabelName = this.getMergeReadyLabelName(pr);
        const dDayLabelName = this.getDdayLabelName(pr);
        const deployTypeLabelName = this.getDeployTypeLabelName(pr);
        const qcLabelName = this.getQCLabelName(pr);
        let isAdded = false;

        if (blockingLabelName) return;
        if (!mergeReadyLabelName || dDayLabelName) {
          if (!mergeReadyLabelName) {
            const isApproved = await this.isApproved(pr);

            if (isApproved) {
              await this.addLabelsToPr(pr, [PullRequestLabelName.MergeReady]);
              isAdded = true;
            }
          }

          if (dDayLabelName) {
            const dDay = this.getDday(dDayLabelName);

            if (dDay <= 0) {
              await this.addLabelsToPr(pr, [PullRequestLabelName.OverDay]);
              isAdded = true;
            } else if (dDay > 0 && dDay <= 3) {
              const newDdayLabel = `D-${dDay - 1}`;

              await this.addLabelsToPr(pr, [
                newDdayLabel as PullRequestLabelName,
              ]);
              isAdded = true;
            }
          }

          if (isAdded) {
            await this.removeLabelsFromPr(pr, [dDayLabelName]);
          }
        }

        if (!deployTypeLabelName) {
          await this.addCommentToPr(
            pr,
            "배포 유형 라벨이 없습니다. 추가해주세요."
          );
        }

        if (!qcLabelName) {
          const comments = await this.getComments(pr);

          if (
            !comments.some((comment) =>
              comment.body.includes("QC 라벨이 없습니다. 확인해주세요.")
            )
          ) {
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
      PullRequestLabelName.DayZero,
      PullRequestLabelName.DayOne,
      PullRequestLabelName.DayTwo,
      PullRequestLabelName.DayThree,
    ];

    return pr.labels.find((label) =>
      dDayLabels.includes(label.name as PullRequestLabelName)
    )?.name as PullRequestLabelName;
  }

  getMergeReadyLabelName(pr: PullRequest): PullRequestLabelName {
    return pr.labels.find(
      (label) => label.name === PullRequestLabelName.MergeReady
    )?.name as PullRequestLabelName;
  }

  getBlockingLabelName(pr: PullRequest): PullRequestLabelName {
    return pr.labels.find(
      (label) => label.name === PullRequestLabelName.Blocking
    )?.name as PullRequestLabelName;
  }

  getDeployTypeLabelName(pr: PullRequest): PullRequestLabelName {
    const deployTypeLabels = [
      PullRequestLabelName.NewFeature,
      PullRequestLabelName.BugFix,
      PullRequestLabelName.FeatureEnhancement,
      PullRequestLabelName.OtherChange,
    ];

    return pr.labels.find((label) =>
      deployTypeLabels.includes(label.name as PullRequestLabelName)
    )?.name as PullRequestLabelName;
  }

  getQCLabelName(pr: PullRequest): PullRequestLabelName {
    return pr.labels.find(
      (label) => label.name === PullRequestLabelName.QcNotNeeded
    )?.name as PullRequestLabelName;
  }

  async addLabelsToPr(pr: PullRequest, labelNames: PullRequestLabelName[]) {
    try {
      const response = await this.octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
        {
          owner: this.owner,
          repo: this.repo,
          issue_number: pr.number,
          labels: labelNames,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          },
        }
      );

      if (response.status !== 200) {
        throw new Error("Error adding labels to PR: status is not 200");
      }

      const repoLabelNames = response.data.map((e) => e.name);

      if (
        !labelNames.every((labelName) =>
          repoLabelNames.includes(labelName as PullRequestLabelName)
        )
      ) {
        throw new Error(
          "Error adding labels to PR: not all labels are added to PR"
        );
      }
    } catch (error) {
      console.log(error);
      throw new Error(`Error adding labels to PR: ${error.message}`);
    }
  }

  async removeLabelsFromPr(
    pr: PullRequest,
    labelNames: PullRequestLabelName[]
  ) {
    try {
      await Promise.all(
        labelNames.map(async (labelName) => {
          const response = await this.octokit.request(
            "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}",
            {
              owner: this.owner,
              repo: this.repo,
              issue_number: pr.number,
              name: labelName,
              headers: {
                "X-GitHub-Api-Version": "2022-11-28",
                authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
              },
            }
          );

          if (
            response.status !== 200 ||
            response.data.map((e) => e.name).includes(labelName)
          ) {
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
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: this.owner,
          repo: this.repo,
          issue_number: pr.number,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          },
        }
      );

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
      const response = await this.octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: this.owner,
          repo: this.repo,
          issue_number: pr.number,
          body,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          },
        }
      );

      if (response.status !== 201) {
        throw new Error("Error adding comment to PR");
      }
    } catch (error) {
      throw new Error(`Error adding comment to PR: ${error.message}`);
    }
  }

  async isApproved(pr: PullRequest): Promise<boolean> {
    try {
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
        {
          owner: this.owner,
          repo: this.repo,
          pull_number: pr.number,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          },
        }
      );

      if (response.status !== 200) {
        throw new Error("Error fetching reviews");
      }

      const reviews = response.data;

      return reviews.some((review: any) => review.state === "APPROVED");
    } catch (error) {
      throw new Error(`Error fetching reviews: ${error.message}`);
    }
  }

  createPrReviewLinkText(pr: PullRequest): string {
    const jiraNumber = pr.title
      .match(JIRA_REG_EXP)?.[0]
      .replace("[", "")
      .replace("]", "");
    const nonJiraNumber = pr.title
      .match(NON_JIRA_REG_EXP)?.[0]
      .replace("[", "")
      .replace("]", "");
    const jiraText = jiraNumber
      ? `<https://jnpmedi.atlassian.net/browse/${jiraNumber} | ${jiraNumber}>`
      : nonJiraNumber;

    const prTitle = jiraNumber
      ? pr.title.replace(JIRA_REG_EXP, "").trim()
      : pr.title.replace(NON_JIRA_REG_EXP, "").trim();
    const prText = `<${pr.html_url} | ${prTitle}>`;

    return jiraText ? `[${jiraText}] ${prText}` : prText;
  }

  splicePrsByLabels(
    pullRequests: PullRequest[],
    labelNames: PullRequestLabelName[]
  ): PullRequest[] {
    const prs = pullRequests.splice(0);
    const prsByLabels = prs.filter((pr) =>
      pr.labels.some((label) =>
        labelNames.includes(label.name as PullRequestLabelName)
      )
    );

    pullRequests.push(
      ...prs.filter(
        (pr) =>
          !pr.labels.some((label) =>
            labelNames.includes(label.name as PullRequestLabelName)
          )
      )
    );

    return prsByLabels;
  }

  /**
   * NOTE: https://api.slack.com/reference/surfaces/formatting#escaping
   * NOTE: https://app.slack.com/block-kit-builder/T04M20EMJDQ
   */
  generateNotificationMessages(pullRequests: PullRequest[]): Template {
    const dDayLabels = [
      PullRequestLabelName.DayZero,
      PullRequestLabelName.DayOne,
      PullRequestLabelName.DayTwo,
      PullRequestLabelName.DayThree,
    ];

    let prs = cloneDeep(pullRequests);
    const blockPRs = this.splicePrsByLabels(prs, [
      PullRequestLabelName.Blocking,
    ]);
    const mergeReadyPRs = this.splicePrsByLabels(prs, [
      PullRequestLabelName.MergeReady,
    ]);
    const overDayPRs = this.splicePrsByLabels(prs, [
      PullRequestLabelName.OverDay,
    ]);
    const dDayPRs = this.splicePrsByLabels(prs, dDayLabels);

    const message: Template = { blocks: [] };

    // Review
    const reviewMessageBlocks = ((): Block[] => {
      const blocks: Block[] = [];

      if (overDayPRs.length > 0) {
        blocks.push(SlackTemplate.getSection("*Over Day*"));
        blocks.push(
          SlackTemplate.getSection(
            overDayPRs.map((pr) => this.createPrReviewLinkText(pr)).join("\n ")
          )
        );
      }

      if (dDayPRs.length > 0) {
        for (let i = 0; i < 4; i++) {
          const targetDayPRs = dDayPRs.filter((pr) =>
            pr.labels.some(
              (label: { name: string }) => label.name === dDayLabels[i]
            )
          );

          if (targetDayPRs.length > 0) {
            blocks.push(SlackTemplate.getSection(`*D-${i}*`));
            blocks.push(
              SlackTemplate.getSection(
                targetDayPRs
                  .map((pr) => this.createPrReviewLinkText(pr))
                  .join("\n ")
              )
            );
          }
        }
      }

      return blocks;
    })();

    if (reviewMessageBlocks.length > 0) {
      message.blocks.push(SlackTemplate.getHeader("✨  오늘의 PR 리뷰  ✨"));
      message.blocks.push(
        SlackTemplate.getContext([
          `${dayjs().format("MMMM DD, YYYY")}  |  ${this.repo}`,
        ])
      );
      message.blocks.push(SlackTemplate.getSection("🔍 |   *REVIEW*  | 🔍 "));
      message.blocks.push(...reviewMessageBlocks);
    }

    // Block
    if (blockPRs.length > 0) {
      message.blocks.push(SlackTemplate.getDivider());
      message.blocks.push(SlackTemplate.getSection("🚧 |   *BLOCK*  | 🚧 "));
      message.blocks.push(
        SlackTemplate.getSection(
          blockPRs.map((pr) => this.createPrReviewLinkText(pr)).join("\n ")
        )
      );
    }

    // Merge Ready
    if (mergeReadyPRs.length > 0) {
      message.blocks.push(SlackTemplate.getDivider());
      message.blocks.push(
        SlackTemplate.getSection("🚀 |   *MERGE READY*  | 🚀 ")
      );
      message.blocks.push(
        SlackTemplate.getSection(
          mergeReadyPRs.map((pr) => this.createPrReviewLinkText(pr)).join("\n ")
        )
      );
    }

    // No PR
    if (message.blocks.length === 0) {
      message.blocks.push(SlackTemplate.getHeader("✨  오늘의 PR 리뷰  ✨"));
      message.blocks.push(
        SlackTemplate.getContext([
          `${dayjs().format("MMMM DD, YYYY")}  |  ${this.repo}`,
        ])
      );
      message.blocks.push(
        SlackTemplate.getHeader("🎁   PR 리뷰가 없습니다~ 🎁")
      );
    }

    return message;
  }
}
