/**
 * A stand-in xAPI Learning Record Store: a real HTTP server with the parts of
 * the xAPI 1.0.3 specification a launched package touches. reactive-lms has no
 * LRS yet, so this is strict instead of real. It checks what an LRS checks
 * (version header, authorization, statement shape, State API parameters, the
 * cross-origin preflight a browser sends) and records every refusal in
 * `violations`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IRI = /^[A-Za-z][A-Za-z0-9+.-]*:\S+$/;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DURATION =
  /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d{1,2})?S)?)?$/;
const IFI_KEYS: readonly string[] = [
  'mbox',
  'mbox_sha1sum',
  'openid',
  'account',
];
const ALLOWED_HEADERS = 'authorization, content-type, x-experience-api-version';

export interface StoredStatement {
  readonly id: string;
  readonly verb: string;
  readonly statement: Record<string, any>;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class StandInLrs {
  readonly statements: StoredStatement[] = [];
  readonly violations: string[] = [];
  readonly requests: string[] = [];
  private readonly states: Map<string, string> = new Map();
  private readonly server: ReturnType<typeof Bun.serve>;

  constructor(private readonly expectedAuth: string) {
    this.server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request: Request): Promise<Response> => this.handle(request),
    });
  }

  get endpoint(): string {
    return `http://127.0.0.1:${this.server.port}/xapi`;
  }

  async stop(): Promise<void> {
    await this.server.stop(true);
  }

  verbs(): string[] {
    return this.statements.map((entry) => entry.verb.split('/').at(-1) ?? '');
  }

  /** The saved State API document for the (single) learner, parsed. */
  savedState(): Record<string, unknown> | null {
    const [text] = [...this.states.values()];
    return text === undefined ? null : JSON.parse(text);
  }

  private reply(
    request: Request,
    status: number,
    body: string = '',
    extra: Record<string, string> = {}
  ): Response {
    const origin: string | null = request.headers.get('Origin');
    return new Response(status === 204 ? null : body, {
      status,
      headers: {
        'X-Experience-API-Version': '1.0.3',
        ...(origin === null ? {} : { 'Access-Control-Allow-Origin': origin }),
        ...extra,
      },
    });
  }

  private refuse(request: Request, status: number, why: string): Response {
    this.violations.push(
      `${request.method} ${new URL(request.url).pathname}: ${why}`
    );
    return this.reply(request, status, why);
  }

  private async handle(request: Request): Promise<Response> {
    const url: URL = new URL(request.url);
    this.requests.push(`${request.method} ${url.pathname}`);

    if (request.method === 'OPTIONS') {
      const asked: string = (
        request.headers.get('Access-Control-Request-Headers') ?? ''
      ).toLowerCase();
      for (const name of asked
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)) {
        if (!ALLOWED_HEADERS.split(', ').includes(name)) {
          return this.refuse(
            request,
            403,
            `preflight asks for header '${name}'`
          );
        }
      }
      return this.reply(request, 204, '', {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': '600',
      });
    }

    if (
      !/^1\.0(\.\d+)?$/.test(
        request.headers.get('X-Experience-API-Version') ?? ''
      )
    ) {
      return this.refuse(
        request,
        400,
        'missing or unsupported X-Experience-API-Version'
      );
    }
    if (request.headers.get('Authorization') !== this.expectedAuth) {
      return this.refuse(request, 401, 'wrong or missing Authorization');
    }

    if (url.pathname === '/xapi/statements' && request.method === 'POST') {
      return this.postStatements(request);
    }
    if (url.pathname === '/xapi/activities/state') {
      return this.state(request, url);
    }
    return this.refuse(request, 404, 'no such resource');
  }

  private async postStatements(request: Request): Promise<Response> {
    if (
      !(request.headers.get('Content-Type') ?? '').startsWith(
        'application/json'
      )
    ) {
      return this.refuse(
        request,
        400,
        'statements must be sent as application/json'
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return this.refuse(request, 400, 'body is not JSON');
    }
    const batch: unknown[] = Array.isArray(body) ? body : [body];
    const problems: string[] = [];
    for (const statement of batch) {
      problems.push(...this.check(statement));
    }
    if (problems.length > 0) {
      return this.refuse(request, 400, problems.join('; '));
    }
    for (const statement of batch as Record<string, any>[]) {
      this.statements.push({
        id: statement['id'],
        verb: statement['verb'].id,
        statement,
      });
    }
    return this.reply(
      request,
      200,
      JSON.stringify((batch as Record<string, any>[]).map((s) => s['id'])),
      { 'Content-Type': 'application/json' }
    );
  }

  /** The checks of xAPI 1.0.3 section 2 that apply to what we send. */
  private check(statement: unknown): string[] {
    if (!isObject(statement)) {
      return ['a statement must be a JSON object'];
    }
    const problems: string[] = [];
    if (typeof statement['id'] !== 'string' || !UUID.test(statement['id'])) {
      problems.push('id must be a UUID');
    } else if (this.statements.some((entry) => entry.id === statement['id'])) {
      problems.push('id was already used');
    }
    const actor = statement['actor'];
    if (!isObject(actor)) {
      problems.push('actor is required');
    } else if (IFI_KEYS.filter((key) => key in actor).length !== 1) {
      problems.push('actor needs exactly one inverse functional identifier');
    }
    const verb = statement['verb'];
    if (
      !isObject(verb) ||
      typeof verb['id'] !== 'string' ||
      !IRI.test(verb['id'])
    ) {
      problems.push('verb.id must be an IRI');
    }
    const object = statement['object'];
    if (
      !isObject(object) ||
      typeof object['id'] !== 'string' ||
      !IRI.test(object['id'])
    ) {
      problems.push('object.id must be an IRI');
    } else if (
      object['objectType'] !== undefined &&
      object['objectType'] !== 'Activity'
    ) {
      problems.push('object.objectType must be Activity');
    }
    if (
      statement['timestamp'] !== undefined &&
      (typeof statement['timestamp'] !== 'string' ||
        !TIMESTAMP.test(statement['timestamp']))
    ) {
      problems.push('timestamp must be ISO 8601 with a time zone');
    }
    const context = statement['context'];
    if (isObject(context) && context['registration'] !== undefined) {
      if (
        typeof context['registration'] !== 'string' ||
        !UUID.test(context['registration'])
      ) {
        problems.push('context.registration must be a UUID');
      }
    }
    const result = statement['result'];
    if (result !== undefined) {
      if (!isObject(result)) {
        problems.push('result must be an object');
      } else {
        if (
          result['duration'] !== undefined &&
          !DURATION.test(String(result['duration']))
        ) {
          problems.push('result.duration must be an ISO 8601 duration');
        }
        const score = result['score'];
        if (score !== undefined) {
          if (!isObject(score)) {
            problems.push('result.score must be an object');
          } else {
            if (
              score['scaled'] !== undefined &&
              !(
                typeof score['scaled'] === 'number' &&
                score['scaled'] >= -1 &&
                score['scaled'] <= 1
              )
            ) {
              problems.push(
                'result.score.scaled must be a number from -1 to 1'
              );
            }
            if (
              typeof score['min'] === 'number' &&
              typeof score['max'] === 'number' &&
              typeof score['raw'] === 'number' &&
              !(score['min'] <= score['raw'] && score['raw'] <= score['max'])
            ) {
              problems.push('result.score.raw must lie between min and max');
            }
          }
        }
      }
    }
    return problems;
  }

  private async state(request: Request, url: URL): Promise<Response> {
    const stateId: string | null = url.searchParams.get('stateId');
    const activityId: string | null = url.searchParams.get('activityId');
    const agent: string | null = url.searchParams.get('agent');
    if (stateId === null || activityId === null || agent === null) {
      return this.refuse(
        request,
        400,
        'stateId, activityId and agent are required'
      );
    }
    if (!IRI.test(activityId)) {
      return this.refuse(request, 400, 'activityId must be an IRI');
    }
    try {
      if (!isObject(JSON.parse(agent))) {
        throw new Error('not an object');
      }
    } catch {
      return this.refuse(request, 400, 'agent must be a JSON object');
    }
    const key: string = [
      stateId,
      activityId,
      agent,
      url.searchParams.get('registration') ?? '',
    ].join('|');
    if (request.method === 'GET') {
      const document: string | undefined = this.states.get(key);
      return document === undefined
        ? this.reply(request, 404)
        : this.reply(request, 200, document, {
            'Content-Type': 'application/json',
          });
    }
    if (request.method === 'PUT') {
      const text: string = await request.text();
      try {
        JSON.parse(text);
      } catch {
        return this.refuse(request, 400, 'state document is not JSON');
      }
      this.states.set(key, text);
      return this.reply(request, 204);
    }
    return this.refuse(request, 405, 'method not supported here');
  }
}
