/**
 * Fetcher function to fetch data from the API
 * @param args
 * @returns
 */
export async function fetcher(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  args[0] = `http://localhost:3000${args[0]}`;
  return fetch(...args);
}
