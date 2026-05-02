export function appendSetCookieHeaders(source: Headers, target: Headers) {
  for (const cookie of getSetCookieValues(source)) {
    target.append("set-cookie", cookie);
  }
}

function getSetCookieValues(headers: Headers) {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    return cookies;
  }

  const cookie = headers.get("set-cookie");

  return cookie === null ? [] : [cookie];
}
