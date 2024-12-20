/**
 * This file contains the function to fetch data from the GitHub API using GraphQL
 */
import "dotenv/config";
import { getLogger } from "@package-rater/shared";

const logger = getLogger("cli");
/**
 * Fetches data from the GitHub API using GraphQL
 * @param packageName The name of the package
 * @param ownerName The owner of the package
 * @param requestString The GraphQL query string
 * @param args Additional arguments for the query
 * @returns The data fetched from the GitHub API
 */
export async function getGitHubData(
  packageName: string,
  ownerName: string,
  requestString: string,
  args?: Record<string, unknown>
): Promise<unknown> {
  const url = "https://api.github.com/graphql";
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
  };
  const data = {
    query: requestString,
    variables: {
      owner: ownerName,
      repo: packageName,
      ...args
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(data)
    });
    const responseData = await response.json();

    // Check for errors in the GraphQL response
    if (responseData.errors) {
      logger.error(`GraphQL errors: ${JSON.stringify(responseData.errors)}`);
      throw new Error("Error in GraphQL response");
    }
    return responseData;
  } catch (error) {
    logger.error(`Error fetching package info: ${error}`);
    throw error;
  }
}
