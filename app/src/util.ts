/**
 * Fetcher function to fetch data from the API
 * @param args
 * @returns
 */
export async function fetcher(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  if (import.meta.env.CLOUDFRONT_ORIGIN) {
    args[0] = `${import.meta.env.CLOUDFRONT_ORIGIN}${args[0]}`;
  } else {
    args[0] = `http://localhost:3000${args[0]}`;
  }
  return fetch(...args);
}
