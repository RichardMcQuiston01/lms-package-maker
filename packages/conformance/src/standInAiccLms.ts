/**
 * A stand-in AICC LMS: a real local HTTP server for the HACP requests an AICC
 * AU makes. reactive-lms has no AICC support, so this is strict instead of
 * real. It answers GetParam in the AICC text layout and checks every PutParam
 * against the AICC data model (section names, `Lesson_Status` words and exit
 * flags, `Score` list, `Time` format, size limits), ends the session on ExitAU,
 * and records every refusal in `violations`.
 */

const STATUS =
  /^(passed|completed|failed|incomplete|browsed|not attempted|[pcfibn])(\s*,\s*(time-out|suspend|logout|[tsl]))?$/i;
const TIME = /^\d{2,4}:\d{2}:\d{2}(\.\d{1,2})?$/;
const SECTIONS: readonly string[] = [
  'core',
  'core_lesson',
  'core_vendor',
  'comments',
  'evaluation',
  'objectives_status',
  'student_preferences',
];

export interface AiccSession {
  location: string;
  status: string;
  score: string;
  time: string;
  suspendData: string;
}

export interface AiccRequest {
  readonly command: string;
  readonly form: Record<string, string>;
}

export class StandInAiccLms {
  readonly requests: AiccRequest[] = [];
  readonly violations: string[] = [];
  /** What the LMS holds for the learner; it survives across sessions. */
  readonly learner: AiccSession = {
    location: '',
    status: 'Not Attempted',
    score: '',
    time: '00:00:00',
    suspendData: '',
  };
  private readonly open: Set<string> = new Set();
  private readonly ended: Set<string> = new Set();
  private readonly server: ReturnType<typeof Bun.serve>;
  masteryScore: number | null = null;
  /** When set, the next request with this command is answered with error 3 (not a violation). */
  refuseNext: string | null = null;

  constructor() {
    this.server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request: Request): Promise<Response> => this.handle(request),
    });
  }

  /** The AICC_URL the LMS gives the AU. */
  get url(): string {
    return `http://127.0.0.1:${this.server.port}/aicc/hacp`;
  }

  async stop(): Promise<void> {
    await this.server.stop(true);
  }

  /** Opens a session the way a launch does, and returns the launch query. */
  launch(sessionId: string): Record<string, string> {
    this.open.add(sessionId);
    this.requests.length = 0;
    return { AICC_SID: sessionId, AICC_URL: this.url };
  }

  commands(): string[] {
    return this.requests.map((request) => request.command);
  }

  private text(request: Request, body: string, status: number = 200): Response {
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
      },
    });
  }

  private answer(
    request: Request,
    code: number,
    text: string,
    data: string = ''
  ): Response {
    return this.text(
      request,
      `error=${code}\r\nerror_text=${text}\r\nversion=3.5\r\naicc_data=${data}`
    );
  }

  private refuse(
    request: Request,
    code: number,
    text: string,
    why: string
  ): Response {
    this.violations.push(why);
    return this.answer(request, code, text);
  }

  private async handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      });
    }
    if (request.method !== 'POST') {
      return this.refuse(
        request,
        1,
        'Invalid Command',
        'HACP requests must be POSTed'
      );
    }
    if (
      !(request.headers.get('Content-Type') ?? '').startsWith(
        'application/x-www-form-urlencoded'
      )
    ) {
      return this.refuse(
        request,
        1,
        'Invalid Command',
        'HACP requests must be application/x-www-form-urlencoded'
      );
    }
    const form: Record<string, string> = Object.fromEntries(
      new URLSearchParams(await request.text())
    );
    const command = form['command'] ?? '';
    this.requests.push({ command, form });
    if (
      !/^(getparam|putparam|exitau|putcomments|putobjectives|putinteractions|putpath|putperformance)$/i.test(
        command
      )
    ) {
      return this.refuse(
        request,
        1,
        'Invalid Command',
        `unknown command '${command}'`
      );
    }
    if (!form['version']) {
      return this.refuse(
        request,
        1,
        'Invalid Command',
        `${command} without a version`
      );
    }
    if (
      this.refuseNext !== null &&
      command.toLowerCase() === this.refuseNext.toLowerCase()
    ) {
      this.refuseNext = null;
      return this.answer(request, 3, 'Invalid Session ID');
    }
    const session = form['session_id'] ?? '';
    if (this.ended.has(session)) {
      return this.refuse(
        request,
        3,
        'Invalid Session ID',
        `${command} after ExitAU for session ${session}`
      );
    }
    if (!this.open.has(session)) {
      return this.answer(request, 3, 'Invalid Session ID');
    }
    switch (command.toLowerCase()) {
      case 'getparam':
        return this.getParam(request);
      case 'putparam':
        return this.putParam(request, form['aicc_data'] ?? '');
      case 'exitau':
        this.open.delete(session);
        this.ended.add(session);
        return this.answer(request, 0, 'Successful');
      default:
        return this.answer(request, 0, 'Successful');
    }
  }

  private getParam(request: Request): Response {
    const learner = this.learner;
    const lines = [
      '[Core]',
      'Student_ID=learner-1',
      'Student_Name=Lovelace, Ada',
      `Lesson_Location=${learner.location}`,
      'Credit=C',
      `Lesson_Status=${learner.status}`,
      `Score=${learner.score}`,
      `Time=${learner.time}`,
      '[Core_Lesson]',
      learner.suspendData,
      '[Evaluation]',
      'Course_ID=1',
      ...(this.masteryScore === null
        ? []
        : ['[Student_Data]', `Mastery_Score=${this.masteryScore}`]),
    ];
    return this.answer(request, 0, 'Successful', `${lines.join('\r\n')}\r\n`);
  }

  private putParam(request: Request, data: string): Response {
    if (!/^\s*\[core\]/i.test(data)) {
      return this.refuse(
        request,
        1,
        'Invalid Command',
        'PutParam aicc_data must start with [Core]'
      );
    }
    const problems: string[] = [];
    const sections = new Map<string, string[]>();
    let current: string[] | null = null;
    for (const line of data.split(/\r\n|\r|\n/)) {
      const header = line.trim().match(/^\[([^\]]+)\]$/);
      if (header !== null) {
        const name = (header[1] ?? '').toLowerCase();
        if (!SECTIONS.includes(name))
          problems.push(`unknown section [${header[1]}]`);
        current = [];
        sections.set(name, current);
      } else {
        current?.push(line);
      }
    }
    const core = new Map<string, string>();
    for (const line of sections.get('core') ?? []) {
      const at = line.indexOf('=');
      if (line.trim() !== '' && at <= 0)
        problems.push(`[Core] line is not key=value: '${line}'`);
      if (at > 0)
        core.set(
          line.slice(0, at).trim().toLowerCase(),
          line.slice(at + 1).trim()
        );
    }
    for (const key of core.keys()) {
      if (!['lesson_location', 'lesson_status', 'score', 'time'].includes(key))
        problems.push(`unknown [Core] key '${key}'`);
    }
    const status = core.get('lesson_status');
    if (status !== undefined && !STATUS.test(status))
      problems.push(`Lesson_Status '${status}' is not an AICC status`);
    const score = core.get('score');
    if (
      score !== undefined &&
      score !== '' &&
      !/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){0,2}$/.test(score)
    )
      problems.push(`Score '${score}' is not raw[,max[,min]]`);
    const time = core.get('time');
    if (time !== undefined && !TIME.test(time))
      problems.push(`Time '${time}' is not HH:MM:SS`);
    const location = core.get('lesson_location');
    if (location !== undefined && location.length > 255)
      problems.push('Lesson_Location is longer than 255 characters');
    const suspend = (sections.get('core_lesson') ?? []).join('\n').trim();
    if (suspend.length > 4096)
      problems.push('[Core_Lesson] is longer than 4096 characters');
    if (problems.length > 0) {
      return this.refuse(
        request,
        1,
        'Invalid Command',
        `PutParam: ${problems.join('; ')}`
      );
    }
    if (location !== undefined) this.learner.location = location;
    if (status !== undefined)
      this.learner.status = status.split(',')[0] ?? status;
    if (score !== undefined) this.learner.score = score;
    if (time !== undefined) this.learner.time = time;
    if (sections.has('core_lesson')) this.learner.suspendData = suspend;
    return this.answer(request, 0, 'Successful');
  }
}
