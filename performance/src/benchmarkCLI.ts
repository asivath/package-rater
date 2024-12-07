/**
 * This script runs a load test on the CLI and Lambda functions.
 */
import ora from "ora";
import chalk from "chalk";
import { exec } from "child_process";

const cliCommand = "./run url.txt";
const lambdaURL = "https://fmaxbcdw2tjvvidkc3oij5yor40dngjf.lambda-url.us-east-2.on.aws";
const lodashURL = "https://github.com/lodash/lodash";
const concurrentClients = 10;
const testDurationMs = 30000;

interface Metrics {
  latencies: number[];
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

/**
 * This function creates a new metrics object
 * @returns Metrics object 
 */
const createMetrics = (): Metrics => ({
  latencies: [],
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
});

/**
 * This function runs the CLI command with the given URL
 * @param url 
 * @returns 
 */
const runCLI = (url: string): Promise<number> => {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    exec(`${cliCommand} ${url}`, { cwd: "../cli"}, (error) => {
      const latency = performance.now() - start;
      if (error) reject(latency);
      else resolve(latency);
    });
  });
};

const callLambda = async (url: string): Promise<number> => {
  const start = performance.now();
  await fetch(lambdaURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return performance.now() - start;
};

const clientWorker = async (
  clientId: number,
  metrics: Metrics,
  requestFn: (url: string) => Promise<number>
) => {
  const spinner = ora(`Client ${clientId} starting...`).start();
  const endTime = Date.now() + testDurationMs;

  while (Date.now() < endTime) {
    try {
      const latency = await requestFn(lodashURL);
      metrics.latencies.push(latency);
      metrics.totalRequests++;
      metrics.successfulRequests++;
      spinner.text = `Client ${clientId}: Response time ${latency.toFixed(2)} ms`;
    } catch (error) {
      console.error(error);
      metrics.totalRequests++;
      metrics.failedRequests++;
      spinner.text = `Client ${clientId}: Request failed`;
    }
  }

  spinner.succeed(`Client ${clientId} completed`);
};

const calculateMetrics = (metrics: Metrics, duration: number) => {
  const meanLatency =
    metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
  const sortedLatencies = metrics.latencies.sort((a, b) => a - b);
  const medianLatency =
    sortedLatencies[Math.floor(sortedLatencies.length / 2)];
  const p99Latency =
    sortedLatencies[Math.floor(sortedLatencies.length * 0.99) - 1];

  return {
    meanLatency,
    medianLatency,
    p99Latency,
    throughput: metrics.totalRequests / duration,
  };
};

const runLoadTest = async (
  testName: string,
  requestFn: (url: string) => Promise<number>
) => {
  console.log(chalk.blue(`Starting load test: ${testName}`));
  const startTime = Date.now();
  const metrics = createMetrics();

  const clientPromises = Array.from({ length: concurrentClients }, (_, i) =>
    clientWorker(i + 1, metrics, requestFn)
  );

  await Promise.all(clientPromises);

  const duration = (Date.now() - startTime) / 1000;
  const { meanLatency, medianLatency, p99Latency, throughput } =
    calculateMetrics(metrics, duration);

  console.log(chalk.green(`\n${testName} completed. Results:`));
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Total requests: ${metrics.totalRequests}`);
  console.log(`Successful requests: ${metrics.successfulRequests}`);
  console.log(`Failed requests: ${metrics.failedRequests}`);
  console.log(`Mean latency: ${meanLatency.toFixed(2)} ms`);
  console.log(`Median latency: ${medianLatency.toFixed(2)} ms`);
  console.log(`99th percentile latency: ${p99Latency.toFixed(2)} ms`);
  console.log(`Throughput: ${throughput.toFixed(2)} requests/sec`);
};

const main = async () => {
  try {
    await runLoadTest("CLI Performance Test", runCLI);
    await runLoadTest("Lambda Performance Test", callLambda);
  } catch (error) {
    console.error(chalk.red("Error running load test:"), error);
  }
};

main();