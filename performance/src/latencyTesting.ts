import ora from "ora";
import chalk from "chalk";

const ec2RegistryURL = "http://ec2-18-189-102-87.us-east-2.compute.amazonaws.com:3000/package/1661073630484675";
const localRegistryURL = "http://localhost:3000/package/1661073630484675";
const concurrentClients = 100;
const testDurationMs = 10000;

interface Metrics {
  latencies: number[];
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

const metrics: Metrics = {
  latencies: [],
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
};

async function clientWorker(clientId: number) {
  const spinner = ora(`Client ${clientId} starting...`).start();
  const endTime = Date.now() + testDurationMs;

  while (Date.now() < endTime) {
    const start = performance.now();
    try {
      await fetch(localRegistryURL);
      const latency = performance.now() - start;

      metrics.latencies.push(latency);
      metrics.totalRequests++;
      metrics.successfulRequests++;

      spinner.text = `Client ${clientId}: Response time ${latency.toFixed(2)} ms`;
    } catch (error) {
      metrics.totalRequests++;
      metrics.failedRequests++;
      spinner.text = `Client ${clientId}: Request failed`;
    }
  }

  spinner.succeed(`Client ${clientId} completed`);
}


async function runLoadTest() {
  console.log(chalk.blue("Starting load test..."));
  const startTime = Date.now();

  const clientPromises = Array.from({ length: concurrentClients }, (_, i) =>
    clientWorker(i + 1)
  );

  await Promise.all(clientPromises);

  const duration = (Date.now() - startTime) / 1000;

  console.log(chalk.green("\nTest completed. Results:"));

  if (metrics.latencies.length > 0) {
    const meanLatency =
      metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
    const sortedLatencies = metrics.latencies.sort((a, b) => a - b);
    const medianLatency =
      sortedLatencies[Math.floor(sortedLatencies.length / 2)];
    const p99Latency =
      sortedLatencies[Math.floor(sortedLatencies.length * 0.99) - 1];

    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Total requests: ${metrics.totalRequests}`);
    console.log(`Successful requests: ${metrics.successfulRequests}`);
    console.log(`Failed requests: ${metrics.failedRequests}`);
    console.log(`Mean latency: ${meanLatency.toFixed(2)} ms`);
    console.log(`Median latency: ${medianLatency.toFixed(2)} ms`);
    console.log(`99th percentile latency: ${p99Latency.toFixed(2)} ms`);
    console.log(
      `Throughput: ${(metrics.totalRequests / duration).toFixed(2)} requests/sec`
    );
  } else {
    console.log("No successful requests to calculate latency metrics.");
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Total requests: ${metrics.totalRequests}`);
    console.log(`Successful requests: ${metrics.successfulRequests}`);
    console.log(`Failed requests: ${metrics.failedRequests}`);
    console.log("Mean latency: N/A");
    console.log("Median latency: N/A");
    console.log("99th percentile latency: N/A");
    console.log(
      `Throughput: ${(metrics.totalRequests / duration).toFixed(2)} requests/sec`
    );
  }
}

runLoadTest().catch((error) => {
  console.error(chalk.red("Error running load test:"), error);
});
