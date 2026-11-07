import { isObject, xapiStatementProblems } from './standInLrs';

/**
 * A stand-in cmi5 LMS and LRS in one real local HTTP server. reactive-lms only
 * detects cmi5 packages, so this is strict instead of real. On top of the xAPI
 * checks it enforces what cmi5 asks of an AU: the one-time `fetch` address and
 * Basic token, the `LMS.LaunchData` document, the context template, the verb
 * and ordering rules (section 9.3), result and duration rules (9.5), the
 * category activities (9.6.2) and the launch modes (10.2.2). Every refusal is
 * kept in `violations`.
 */

const CMI5 = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const MOVEON = 'https://w3id.org/xapi/cmi5/context/categories/moveon';
const SESSION = 'https://w3id.org/xapi/cmi5/context/extensions/sessionid';
const MASTERY = 'https://w3id.org/xapi/cmi5/context/extensions/masteryscore';
const VERB = 'http://adlnet.gov/expapi/verbs/';
const DEFINED: readonly string[] = [
  'initialized',
  'completed',
  'passed',
  'failed',
  'terminated',
];
const DURATION =
  /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d{1,2})?S)?)?$/;

export interface Cmi5LaunchSetup {
  readonly actor: Record<string, unknown>;
  readonly registration: string;
  readonly activityId: string;
  readonly publisherId: string;
  readonly sessionId: string;
  readonly launchMode?: 'Normal' | 'Browse' | 'Review';
  readonly masteryScore?: number;
  readonly moveOn?: string;
  readonly returnURL?: string;
}

export interface Cmi5Statement {
  readonly verb: string;
  readonly statement: Record<string, any>;
}

export class StandInCmi5Lms {
  readonly statements: Cmi5Statement[] = [];
  readonly violations: string[] = [];
  readonly requests: string[] = [];
  private readonly states: Map<string, string> = new Map();
  private readonly server: ReturnType<typeof Bun.serve>;
  private tokenIssued = false;
  private launch: Cmi5LaunchSetup | null = null;
  private launchToken = 'bGVhcm5lcjpzZWNyZXQ=';
  private terminatedSession = false;
  private sessionStatements: Cmi5Statement[] = [];

  constructor() {
    this.server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request: Request): Promise<Response> => this.handle(request),
    });
  }

  get endpoint(): string {
    return `http://127.0.0.1:${this.server.port}/xapi`;
  }

  get fetchUrl(): string {
    return `http://127.0.0.1:${this.server.port}/fetch?k=abc`;
  }

  /** The Basic token the fetch address hands out (for tests that act as the AU). */
  get token(): string {
    return this.launchToken;
  }

  async stop(): Promise<void> {
    await this.server.stop(true);
  }

  verbs(): string[] {
    return this.statements.map((entry) => entry.verb);
  }

  /** The verbs of the current session only. */
  sessionVerbs(): string[] {
    return this.sessionStatements.map((entry) => entry.verb);
  }

  /** Prepares a launch the way an LMS does: write LMS.LaunchData, arm the fetch address. */
  prepareLaunch(setup: Cmi5LaunchSetup): void {
    this.launch = setup;
    this.tokenIssued = false;
    this.terminatedSession = false;
    this.sessionStatements = [];
    const document = {
      contextTemplate: {
        contextActivities: { grouping: [{ id: setup.publisherId }] },
        extensions: { [SESSION]: setup.sessionId },
      },
      launchMode: setup.launchMode ?? 'Normal',
      moveOn: setup.moveOn ?? 'Passed',
      ...(setup.masteryScore === undefined
        ? {}
        : { masteryScore: setup.masteryScore }),
      ...(setup.returnURL === undefined ? {} : { returnURL: setup.returnURL }),
    };
    this.states.set(this.key('LMS.LaunchData'), JSON.stringify(document));
  }

  /** The launch URL's query string for the prepared launch. */
  launchQuery(): Record<string, string> {
    const launch = this.requireLaunch();
    return {
      endpoint: this.endpoint,
      fetch: this.fetchUrl,
      actor: JSON.stringify(launch.actor),
      registration: launch.registration,
      activityId: launch.activityId,
    };
  }

  /** The AU's own saved state document, parsed. */
  savedState(): Record<string, unknown> | null {
    const text = this.states.get(this.key('lms-package-maker.state'));
    return text === undefined ? null : JSON.parse(text);
  }

  private requireLaunch(): Cmi5LaunchSetup {
    if (this.launch === null) {
      throw new Error('prepareLaunch() must be called first');
    }
    return this.launch;
  }

  private key(stateId: string): string {
    const launch = this.requireLaunch();
    return [
      stateId,
      launch.activityId,
      JSON.stringify(launch.actor),
      launch.registration,
    ].join('|');
  }

  private cors(
    request: Request,
    extra: Record<string, string> = {}
  ): Record<string, string> {
    const origin = request.headers.get('Origin');
    return {
      'X-Experience-API-Version': '1.0.3',
      ...(origin === null ? {} : { 'Access-Control-Allow-Origin': origin }),
      ...extra,
    };
  }

  private reply(
    request: Request,
    status: number,
    body: string = '',
    extra: Record<string, string> = {}
  ): Response {
    return new Response(status === 204 ? null : body, {
      status,
      headers: this.cors(request, extra),
    });
  }

  private refuse(request: Request, status: number, why: string): Response {
    this.violations.push(
      `${request.method} ${new URL(request.url).pathname}: ${why}`
    );
    return this.reply(request, status, why);
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.requests.push(`${request.method} ${url.pathname}`);

    if (request.method === 'OPTIONS') {
      return this.reply(request, 204, '', {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'authorization, content-type, x-experience-api-version',
        'Access-Control-Max-Age': '600',
      });
    }

    if (url.pathname === '/fetch') {
      // cmi5 8.2: POST only, answered 200 with JSON, token handed out once.
      if (request.method !== 'POST') {
        return this.refuse(
          request,
          405,
          'the fetch address must be POSTed to, never GET'
        );
      }
      const json = { 'Content-Type': 'application/json' };
      if (this.tokenIssued) {
        this.violations.push('fetch address used a second time');
        return this.reply(
          request,
          200,
          JSON.stringify({
            'error-code': '1',
            'error-text': 'The authorization token has already been returned.',
          }),
          json
        );
      }
      this.tokenIssued = true;
      return this.reply(
        request,
        200,
        JSON.stringify({ 'auth-token': this.launchToken }),
        json
      );
    }

    if (request.headers.get('Authorization') !== `Basic ${this.launchToken}`) {
      return this.refuse(request, 401, 'wrong or missing Authorization');
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
    if (url.pathname === '/xapi/statements' && request.method === 'POST') {
      return this.postStatements(request);
    }
    if (url.pathname === '/xapi/activities/state') {
      return this.state(request, url);
    }
    if (url.pathname === '/xapi/agents/profile' && request.method === 'GET') {
      if (url.searchParams.get('profileId') !== 'cmi5LearnerPreferences') {
        return this.refuse(request, 400, 'unexpected profileId');
      }
      return this.reply(request, 404);
    }
    return this.refuse(request, 404, 'no such resource');
  }

  private async state(request: Request, url: URL): Promise<Response> {
    const launch = this.requireLaunch();
    const stateId = url.searchParams.get('stateId');
    if (
      stateId === null ||
      url.searchParams.get('activityId') !== launch.activityId ||
      url.searchParams.get('registration') !== launch.registration ||
      url.searchParams.get('agent') !== JSON.stringify(launch.actor)
    ) {
      return this.refuse(
        request,
        400,
        'state request does not match the launch (activityId, agent, registration)'
      );
    }
    const key = this.key(stateId);
    if (request.method === 'GET') {
      const document = this.states.get(key);
      return document === undefined
        ? this.reply(request, 404)
        : this.reply(request, 200, document, {
            'Content-Type': 'application/json',
          });
    }
    if (request.method === 'PUT') {
      if (stateId === 'LMS.LaunchData') {
        return this.refuse(
          request,
          403,
          'the AU must not modify LMS.LaunchData'
        );
      }
      const text = await request.text();
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

  private async postStatements(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return this.refuse(request, 400, 'body is not JSON');
    }
    const batch: unknown[] = Array.isArray(body) ? body : [body];
    const problems: string[] = [];
    for (const statement of batch) {
      problems.push(...this.cmi5Problems(statement));
    }
    if (problems.length > 0) {
      return this.refuse(request, 400, problems.join('; '));
    }
    for (const statement of batch as Record<string, any>[]) {
      const entry = {
        verb: String(statement['verb'].id).split('/').at(-1) ?? '',
        statement,
      };
      this.statements.push(entry);
      this.sessionStatements.push(entry);
      if (entry.verb === 'terminated' && this.isDefined(statement)) {
        this.terminatedSession = true;
      }
    }
    return this.reply(
      request,
      200,
      JSON.stringify((batch as Record<string, any>[]).map((s) => s['id'])),
      { 'Content-Type': 'application/json' }
    );
  }

  private isDefined(statement: Record<string, any>): boolean {
    const categories: any[] =
      statement['context']?.['contextActivities']?.['category'] ?? [];
    return categories.some((category) => category?.id === CMI5);
  }

  /** xAPI checks plus everything cmi5 sections 7 to 10 ask of an AU. */
  private cmi5Problems(statement: unknown): string[] {
    const problems: string[] = xapiStatementProblems(
      statement,
      new Set(this.statements.map((entry) => entry.statement['id']))
    );
    if (problems.length > 0 || !isObject(statement)) {
      return problems;
    }
    const launch = this.requireLaunch();
    const verb = String(statement['verb'].id);
    const name = verb.startsWith(VERB) ? verb.slice(VERB.length) : verb;
    const context = statement['context'];
    const result = statement['result'];
    const defined = this.isDefined(statement);
    const mode = launch.launchMode ?? 'Normal';

    if (this.terminatedSession) {
      problems.push('no statement may follow terminated in a session');
    }
    if (JSON.stringify(statement['actor']) !== JSON.stringify(launch.actor)) {
      problems.push('actor must be the launch actor');
    }
    if (statement['object']?.['id'] !== launch.activityId) {
      problems.push('object.id must be the launch activityId');
    }
    if (
      typeof statement['timestamp'] !== 'string' ||
      !statement['timestamp'].endsWith('Z')
    ) {
      problems.push('timestamp is required and must be UTC');
    } else {
      const last = this.sessionStatements.at(-1)?.statement['timestamp'];
      if (typeof last === 'string' && statement['timestamp'] < last) {
        problems.push('timestamps must not go backwards within a session');
      }
    }
    // 9.6: the LMS context template must be carried unchanged
    if (!isObject(context) || context['registration'] !== launch.registration) {
      problems.push('context.registration must be the launch registration');
    }
    if (context?.['extensions']?.[SESSION] !== launch.sessionId) {
      problems.push('context must carry the LMS session id extension');
    }
    const grouping: any[] = context?.['contextActivities']?.['grouping'] ?? [];
    if (!grouping.some((entry) => entry?.id === launch.publisherId)) {
      problems.push(
        'context must keep the publisher id grouping activity from the template'
      );
    }
    // 7.1.1 and 10.2.2
    const first = this.sessionStatements.length === 0;
    if (first && name !== 'initialized') {
      problems.push('the first statement of a session must be initialized');
    }
    if (!first && defined && name === 'initialized') {
      problems.push('initialized must not be repeated');
    }
    if (!defined) {
      if (mode !== 'Normal') {
        problems.push(
          `no statements other than initialized and terminated in ${mode} mode`
        );
      }
      return problems;
    }
    // cmi5 defined statements from here on
    if (!DEFINED.includes(name)) {
      problems.push(`'${name}' is not a cmi5 defined verb an AU may use`);
      return problems;
    }
    if (mode !== 'Normal' && name !== 'initialized' && name !== 'terminated') {
      problems.push(`${name} must not be sent in ${mode} mode`);
    }
    const sent = (verbName: string): boolean =>
      this.statements.some(
        (entry) => entry.verb === verbName && this.isDefined(entry.statement)
      );
    const sentThisSession = (verbName: string): boolean =>
      this.sessionStatements.some(
        (entry) => entry.verb === verbName && this.isDefined(entry.statement)
      );
    if (sentThisSession(name)) {
      problems.push(`${name} must not be sent twice in one session`);
    }
    if (
      (name === 'passed' || name === 'failed') &&
      (sentThisSession('passed') || sentThisSession('failed'))
    ) {
      problems.push('only one of passed or failed may be sent per session');
    }
    if ((name === 'completed' || name === 'passed') && sent(name)) {
      problems.push(`${name} may be sent once per registration`);
    }
    if (name === 'failed' && sent('passed')) {
      problems.push('failed must not follow passed in a registration');
    }
    const categories: string[] = (
      context?.['contextActivities']?.['category'] ?? []
    ).map((c: any) => c?.id);
    const hasResultFlag =
      isObject(result) && ('success' in result || 'completion' in result);
    if (hasResultFlag !== categories.includes(MOVEON)) {
      problems.push(
        'the moveOn category must be present exactly when result has success or completion'
      );
    }
    // 9.5
    if (
      ['completed', 'passed', 'failed', 'terminated'].includes(name) &&
      !(isObject(result) && DURATION.test(String(result['duration'])))
    ) {
      problems.push(`${name} must have an ISO 8601 result.duration`);
    }
    if (isObject(result)) {
      if ('completion' in result !== (name === 'completed')) {
        problems.push('result.completion belongs to completed statements only');
      }
      if ('success' in result !== (name === 'passed' || name === 'failed')) {
        problems.push(
          'result.success belongs to passed and failed statements only'
        );
      }
      if (name === 'passed' && result['success'] !== true)
        problems.push('passed needs success true');
      if (name === 'failed' && result['success'] !== false)
        problems.push('failed needs success false');
      if ('score' in result && name !== 'passed' && name !== 'failed') {
        problems.push('score is allowed in passed and failed statements only');
      }
      const scaled = result['score']?.['scaled'];
      if (launch.masteryScore !== undefined && typeof scaled === 'number') {
        if (name === 'passed' && scaled < launch.masteryScore)
          problems.push('passed scaled score is below the masteryScore');
        if (name === 'failed' && scaled >= launch.masteryScore)
          problems.push('failed scaled score is not below the masteryScore');
      }
    }
    if (
      (name === 'passed' || name === 'failed') &&
      launch.masteryScore !== undefined &&
      context?.['extensions']?.[MASTERY] !== launch.masteryScore
    ) {
      problems.push('passed and failed must carry the masteryscore extension');
    }
    return problems;
  }
}
