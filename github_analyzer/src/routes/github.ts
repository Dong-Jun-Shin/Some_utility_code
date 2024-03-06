import express from "express";
import GitHubPRAnalyzer from "../service/github.service";

const router = express.Router();
// const githubService = new GitHubPRAnalyzer("Dong-Jun-Shin", "News_summary_crawler");
// const githubService = new GitHubPRAnalyzer("Dong-Jun-Shin", "Noti_Secretary");
const githubService = new GitHubPRAnalyzer("jnpmedi", "maven-docs");

router.get("/pr/analyze", async (req, res, next) => {
  try {
    const pullRequests = await githubService.fetchPullRequests();
    const reviewTimeStatistics = githubService.getReviewTimeStatisticsByPr(pullRequests);
    const message = `총 PR 개수: ${pullRequests.length}개<br/>
      총 PR 리뷰 완료 시간: ${reviewTimeStatistics.total}<br/>
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

export default router;
