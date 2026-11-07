import { fail, type Result } from './types.js';

export const XAPI_VERSION = '1.0.3';

/** Browser services the xAPI and cmi5 adapters need; tests replace them. */
export interface XapiEnvironment {
  readonly fetch: (
    url: string,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      keepalive: boolean;
    }
  ) => Promise<{
    readonly status: number;
    readonly ok: boolean;
    text(): Promise<string>;
  }>;
  readonly now: () => Date;
  readonly newId: () => string;
}

/** What an LRS call answers with. */
export interface XapiResponse {
  readonly status: number;
  readonly ok: boolean;
  text(): Promise<string>;
}

/** Who is talking to which LRS. */
export interface XapiConnection {
  /** LRS base address without a trailing slash. */
  readonly endpoint: string;
  /** Full `Authorization` header value, or null when the LRS needs none. */
  readonly auth: string | null;
  /** The learner, as an xAPI Agent. */
  readonly actor: Readonly<Record<string, unknown>>;
  readonly registration: string | null;
}

/**
 * Requests to an LRS, sent one after another so statements arrive in the order
 * they were made, without blocking the content. A failed request is written to
 * the console (`[lms-package]`) and does not stop the ones after it.
 */
export class XapiTransport {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly connection: XapiConnection,
    readonly environment: XapiEnvironment
  ) {}

  /** Replaces the Authorization header (cmi5 obtains its token after launch). */
  withAuth(auth: string | null): XapiTransport {
    return new XapiTransport({ ...this.connection, auth }, this.environment);
  }

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'X-Experience-API-Version': XAPI_VERSION,
      ...(this.connection.auth === null
        ? {}
        : { Authorization: this.connection.auth }),
      ...extra,
    };
  }

  /** The address of a State API document for this learner and registration. */
  stateUrl(stateId: string, activityId: string): string {
    const query: URLSearchParams = new URLSearchParams({
      stateId,
      activityId,
      agent: JSON.stringify(this.connection.actor),
    });
    if (this.connection.registration !== null) {
      query.set('registration', this.connection.registration);
    }
    return `${this.connection.endpoint}/activities/state?${query.toString()}`;
  }

  /** The address of an Agent Profile document for this learner. */
  profileUrl(profileId: string): string {
    const query: URLSearchParams = new URLSearchParams({
      profileId,
      agent: JSON.stringify(this.connection.actor),
    });
    return `${this.connection.endpoint}/agents/profile?${query.toString()}`;
  }

  /** Sends a request now (not queued) and returns the LRS answer. */
  request(
    method: string,
    url: string,
    body: string | undefined
  ): Promise<XapiResponse> {
    return this.environment.fetch(url, {
      method,
      headers: this.headers(
        body === undefined ? {} : { 'Content-Type': 'application/json' }
      ),
      ...(body === undefined ? {} : { body }),
      keepalive: true,
    });
  }

  /** Queues work behind earlier requests. */
  enqueue(label: string, send: () => Promise<void>): void {
    this.queue = this.queue.then(send).catch((cause: unknown): void => {
      const reason: string =
        cause instanceof Error ? cause.message : String(cause);
      console.error(`[lms-package] xAPI ${label} failed: ${reason}`);
    });
  }

  /** Resolves once everything queued so far has been sent. */
  drain(): Promise<void> {
    return this.queue;
  }

  /** Queues one statement. */
  postStatement(label: string, statement: Record<string, unknown>): void {
    this.enqueue(label, async (): Promise<void> => {
      const response: XapiResponse = await this.request(
        'POST',
        `${this.connection.endpoint}/statements`,
        JSON.stringify(statement)
      );
      if (!response.ok) {
        throw new Error(
          `the LRS answered ${response.status}: ${await response.text()}`
        );
      }
    });
  }
}

/** Describes why the LRS could not be used, for a start-up failure. */
export async function describeFailure(
  action: string,
  response: XapiResponse
): Promise<Result<never>> {
  return fail(
    `${action}: the LRS answered ${response.status}: ${await response.text()}`
  );
}
