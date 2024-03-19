import express from "express";
import GitHubPRAnalyzer, { PullRequestLabelName, PullRequestState } from "../service/github.service";
import Logger, { stringifyObject } from "@lib/function/Logger";
import dayjs from "dayjs";

const router = express.Router();
// const githubService = new GitHubPRAnalyzer("Dong-Jun-Shin", "News_summary_crawler");
const githubService = new GitHubPRAnalyzer("Dong-Jun-Shin", "Noti_Secretary");
// const githubService = new GitHubPRAnalyzer("jnpmedi", "maven-docs");
const loggerService = new Logger(process.env.NOTI_SLACK_URL);

router.get("/prs/analyze", async (req, res, next) => {
  const ticketPattern = /\[(DOCS|docs)-[0-9]{1,}\]/;

  try {
    const pullRequests = await githubService.fetchPullRequests({ title: ticketPattern, state: PullRequestState.CLOSED });
    const reviewTimeStatistics = githubService.getReviewTimeStatisticsByPr(pullRequests);
    const message = `전체 PR 리뷰 기간: ${reviewTimeStatistics.reviewRange}<br/>
      총 PR 개수: ${pullRequests.length}개<br/>
      평균 PR 리뷰 완료 시간: ${reviewTimeStatistics.average}<br/>
      최소 PR 리뷰 완료 시간: ${reviewTimeStatistics.min}<br/>
      최대 PR 리뷰 완료 시간: ${reviewTimeStatistics.max}<br/>
      <br/>
      PR 목록:<br/>
      ${pullRequests.map((pr, i) => `  ${i}. ${pr.title}`).join("<br/>")}
    `;

    res.send(message);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/prs/notification", async (req, res, next) => {
  try {
    // githubService에서 label 조회
    await githubService.setRepoLabels();

    // Open 상태 + MergeReady가 아닌 PR 조회
    const pullRequests = await githubService.fetchPullRequests({
      state: PullRequestState.OPEN,
      labelNames: Object.values(PullRequestLabelName).filter((label) => label !== PullRequestLabelName.MERGE_READY),
    });

    // label 필터해서 변경
    await githubService.updateLabels(pullRequests);

    // 알림 발송
    let message = "";
    const startMessage = `*[INFO]* ✨오늘의 PR 리뷰✨ \n${dayjs().format("YYYY-MM-DD HH:mm:ss Z")}`;

    message += `${startMessage}\n`;
    message += `${githubService.generateNotificationMessage(pullRequests)}\n`;

    console.log(stringifyObject(message));
    console.log(stringifyObject(message, 0));
    console.log("🚀 ~ router.get ~ message:", message);

    // await loggerService.noti(message);

    res.send("Done");
    // res.send(message);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
