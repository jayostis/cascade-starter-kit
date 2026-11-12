// What proves a request comes from the page this launch opened. The server prints one address, `/?launch=<token>`; the
// first request to carry the token is answered with a cookie, and the token is spent. Every route that reads a pod then
// asks for the cookie, so another program on the machine, which can name the right `Host`, `Origin` and `Content-Type`,
// is refused.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface Launch {
  /** The token the printed address carries. */
  readonly token: string;
  /** The cookie's value for `given` when it is the token and the token is not yet spent, which it then is; else nothing. */
  exchange(given: string | undefined): string | undefined;
  /** Whether `given` is the cookie's value. */
  holds(given: string | undefined): boolean;
}

const digest = (text: string) => createHash("sha256").update(text).digest();

/** Whether the two are the same text, in a time that does not tell where they differ. */
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

const secret = () => randomBytes(32).toString("base64url");

/** The name of the cookie for the server at `url`: cookies are not kept apart by port, so the port is in the name. */
export const launchCookie = (url: URL) =>
  `cascade-launch-${url.port || (url.protocol === "https:" ? "443" : "80")}`;

export function newLaunch(): Launch {
  const token = secret();
  let session: string | undefined;
  return {
    token,
    exchange(given) {
      const asked = given !== undefined && same(given, token);
      if (!asked || session !== undefined) return undefined;
      session = secret();
      return session;
    },
    holds: (given) =>
      session !== undefined && given !== undefined && same(given, session),
  };
}
