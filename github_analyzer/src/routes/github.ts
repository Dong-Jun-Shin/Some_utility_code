import express from "express";
import GitHubPRAnalyzer, { PullRequestState } from "../service/github.service";
import axios from "axios";

const router = express.Router();
// const githubRepoService = new GitHubPRAnalyzer("Dong-Jun-Shin", "News_summary_crawler");
// const githubRepoService = new GitHubPRAnalyzer(
//   "Dong-Jun-Shin",
//   "Noti_Secretary"
// );
const githubRepoService = new GitHubPRAnalyzer("jnpmedi", "maven-docs");

router.get("/prs/analyze", async (req, res, next) => {
  const ticketPattern = /\[(DOCS|docs)-[0-9]{1,}\]/;

  try {
    const pullRequests = await githubRepoService.fetchPullRequests({
      title: ticketPattern,
      state: PullRequestState.Closed,
    });
    const reviewTimeStatistics =
      githubRepoService.getReviewTimeStatisticsByPr(pullRequests);
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
    console.error("🚀 ~ router.get ~ /prs/analyze: ", error.message);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/prs/notification", async (req, res, next) => {
  try {
    // githubService에서 label 조회
    await githubRepoService.setRepoLabels();

    // Open 상태 + MergeReady가 아닌 PR 조회
    let pullRequests = await githubRepoService.fetchPullRequests({
      state: PullRequestState.Open,
    });

    // label 필터해서 변경
    await githubRepoService.updateLabels(pullRequests);

    // 변경된 label로 PR 재조회
    pullRequests = await githubRepoService.fetchPullRequests({
      state: PullRequestState.Open,
    });

    // 알림 발송
    const message =
      githubRepoService.generateNotificationMessages(pullRequests);

    await axios.request({
      method: "POST",
      url: process.env.NOTI_SLACK_URL,
      timeout: 1350,
      data: message,
    });

    res.send(JSON.stringify(message));
  } catch (error) {
    console.error("🚀 ~ router.get ~ /prs/notification: ", error.message);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
