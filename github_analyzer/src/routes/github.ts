import express from "express";
import GitHubPRAnalyzer from "../service/github.service";

const router = express.Router();
// const githubService = new GitHubPRAnalyzer("Dong-Jun-Shin", "News_summary_crawler");
const githubService = new GitHubPRAnalyzer("Dong-Jun-Shin", "Noti_Secretary");
// const githubService = new GitHubPRAnalyzer("jnpmedi", "maven-docs");

router.get("/prs/analyze", async (req, res, next) => {
  try {
    const pullRequests = await githubService.fetchPullRequests();
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
    // Open 상태 + MergeReady가 아닌 PR 조회
    const pullRequests = await githubService.fetchPullRequests();

    // label 필터해서 변경



    // 알림 발송

    // res.send(message);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
