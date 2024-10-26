import "dotenv/config";
import { getLogger } from "@package-rater/shared";

const logger = getLogger("cli");

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
    // console.log("responseData", responseData);

    // Check for errors in the GraphQL response
    if (responseData.errors) {
      logger.error("GraphQL errors:", responseData.errors);
      throw new Error("Error in GraphQL response");
    }
    return responseData;
  } catch (error) {
    logger.error("Error fetching package info:", error);
    throw error;
  }
}
