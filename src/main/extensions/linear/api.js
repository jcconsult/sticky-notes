/* Talking to Linear: one GraphQL request, and its errors in words.
 *
 * Linear answers a bad query or a bad key with a JSON `errors` list — with
 * HTTP 200 or 400 — so the body is always read, and Linear's own message is
 * what the widget shows. A wrong field name then says exactly which field.
 */
const ENDPOINT = 'https://api.linear.app/graphql';

// An error the widget can show, marked when the key itself is the problem —
// only then is the connection shown as broken in Settings → Connections.
function failure(message, auth = false) {
  const error = new Error(message);
  error.auth = auth;
  return error;
}

function fromGraphQL(first) {
  const ext = (first && first.extensions) || {};
  const code = String(ext.code || ext.type || '').toUpperCase();
  if (/AUTHENTICATION/.test(code)) return failure('Linear didn’t accept the API key', true);
  if (/FORBIDDEN/.test(code)) {
    return failure('the API key can’t read this — give it Read access in Linear', true);
  }
  if (/RATELIMITED/.test(code)) return failure('Linear’s rate limit was reached; it will try again shortly');
  const text = ext.userPresentableMessage || (first && first.message) || 'unknown error';
  return failure(`Linear said: ${text}`);
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {object} host    the widget host (its fetch has the timeout and cap)
 * @param {string} key     a personal API key
 * @param {string} query   GraphQL
 * @param {object} [variables]
 * @returns {Promise<object>} the response's `data`
 */
async function request(host, key, query, variables = {}) {
  let text;
  try {
    text = await host.fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    const body = err && err.body ? parse(err.body) : null;
    if (body && Array.isArray(body.errors) && body.errors.length) throw fromGraphQL(body.errors[0]);
    if (err && (err.status === 401 || err.status === 403)) throw failure('Linear didn’t accept the API key', true);
    throw failure(`couldn’t reach Linear: ${(err && err.message) || 'no connection'}`);
  }
  const json = parse(text);
  if (!json) throw failure('Linear sent something that isn’t JSON');
  if (Array.isArray(json.errors) && json.errors.length) throw fromGraphQL(json.errors[0]);
  if (!json.data) throw failure('Linear sent no data');
  return json.data;
}

module.exports = { request, ENDPOINT };
