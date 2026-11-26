/** Campaign parameters that may cross an internal redirect. Everything else is dropped. */
export const SAFE_CAMPAIGN_PARAMETERS = Object.freeze([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
] as const);

const MAX_VALUE_LENGTH = 256;
const MAX_TOTAL_LENGTH = 1024;
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Copy a bounded, explicit attribution allowlist. Repeated keys use the first
 * value, making the result deterministic and preventing parameter smuggling.
 */
export function safeCampaignQuery(input: URLSearchParams): URLSearchParams {
  const output = new URLSearchParams();
  let total = 0;
  for (const key of SAFE_CAMPAIGN_PARAMETERS) {
    const value = input.get(key);
    if (value === null || value.length > MAX_VALUE_LENGTH || CONTROL.test(value)) continue;
    const cost = key.length + value.length;
    if (total + cost > MAX_TOTAL_LENGTH) break;
    output.set(key, value);
    total += cost;
  }
  return output;
}

export function redirectLocation(requestUrl: string, targetPath: string): URL {
  const request = new URL(requestUrl);
  const destination = new URL(targetPath, request.origin);
  destination.search = safeCampaignQuery(request.searchParams).toString();
  destination.hash = '';
  return destination;
}
