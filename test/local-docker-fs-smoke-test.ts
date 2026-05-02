import { startLocalDockerFsApi } from "./support/local-api";
import { readSmokeEnv, runSdkUserFlow } from "./support/user-flow";

const smokeEnv = readSmokeEnv();
const localApi = await startLocalDockerFsApi({
  runnerImage: smokeEnv.runnerImage,
});

const cases = [
  {
    expectedText: "mesh0-local-answer-four",
    label: "local-docker-fs-smoke-math",
    question: "What is 2 + 2? Respond with exactly: mesh0-local-answer-four",
  },
  {
    expectedText: "mesh0-local-answer-paris",
    label: "local-docker-fs-smoke-capital",
    question:
      "What is the capital of France? Respond with exactly: mesh0-local-answer-paris",
  },
  {
    expectedText: "mesh0-local-answer-beta",
    label: "local-docker-fs-smoke-sequence",
    question:
      "What Greek letter comes after alpha? Respond with exactly: mesh0-local-answer-beta",
  },
];

try {
  await Promise.all(
    cases.map(({ expectedText, label, question }) =>
      runSdkUserFlow({
        apiKey: localApi.apiKey,
        apiUrl: localApi.apiUrl,
        env: smokeEnv.openai,
        expectedText,
        label,
        question,
      }),
    ),
  );
} finally {
  localApi.close();
}
