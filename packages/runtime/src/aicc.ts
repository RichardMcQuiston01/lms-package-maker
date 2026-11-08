import {
  fail,
  ok,
  type InitialState,
  type LessonStatus,
  type Result,
  type RuntimeAdapter,
  type Score,
} from './types.js';
import type { XapiEnvironment } from './xapiTransport.js';

/** The AICC HACP version the AU announces in each request. */
const HACP_VERSION = '3.5';
const LOCATION_LIMIT = 255;
const SUSPEND_DATA_LIMIT = 4096;

/** What the LMS passes to the AU's launch URL (AICC HACP). */
export interface AiccLaunch {
  /** The LMS address the AU POSTs its requests to. */
  readonly url: string;
  /** The session id the LMS made for this launch. */
  readonly sessionId: string;
}

/**
 * Reads `AICC_SID` and `AICC_URL` from a query string (the names are matched
 * without regard to case). Returns null when neither is there, so the page was
 * not launched by an AICC LMS, and an error when only one is.
 */
export function parseAiccLaunch(search: string): Result<AiccLaunch | null> {
  let sessionId: string | null = null;
  let url: string | null = null;
  for (const [name, value] of new URLSearchParams(search)) {
    if (name.toLowerCase() === 'aicc_sid') {
      sessionId = value;
    } else if (name.toLowerCase() === 'aicc_url') {
      url = value;
    }
  }
  if ((sessionId ?? '') === '' && (url ?? '') === '') {
    return { ok: true, value: null };
  }
  if ((sessionId ?? '') === '' || (url ?? '') === '') {
    return fail(
      `AICC launch needs both AICC_SID and AICC_URL, but ${(sessionId ?? '') === '' ? 'AICC_SID' : 'AICC_URL'} is missing`
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url as string);
  } catch {
    return fail(`AICC launch AICC_URL is not a valid address: '${url}'`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return fail(
      `AICC launch AICC_URL must start with http:// or https://, got '${parsed.protocol}'`
    );
  }
  return {
    ok: true,
    value: { url: url as string, sessionId: sessionId as string },
  };
}

/** The answer to a GetParam request, reduced to what the AU uses. */
export interface AiccParams {
  readonly location: string | null;
  readonly status: LessonStatus | null;
  readonly suspendData: string | null;
  readonly masteryScore: number | null;
}

/** Maps the AICC `Lesson_Status` word (or its first letter) to a status. */
export function readLessonStatus(value: string): LessonStatus | null {
  const word: string = (value.split(',')[0] ?? '').trim().toLowerCase();
  switch (word.charAt(0)) {
    case 'p':
      return 'passed';
    case 'c':
      return 'completed';
    case 'f':
      return 'failed';
    case 'i':
    case 'b':
      return 'incomplete';
    default:
      return null; // "not attempted", empty or unknown
  }
}

interface Section {
  readonly name: string;
  readonly lines: string[];
}

/** Splits AICC data into its `[Section]` blocks, keeping each block's lines. */
function sectionsOf(data: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of data.split(/\r\n|\r|\n/)) {
    const header: RegExpMatchArray | null = line.trim().match(/^\[([^\]]+)\]$/);
    if (header !== null) {
      current = { name: (header[1] ?? '').toLowerCase(), lines: [] };
      sections.push(current);
    } else if (current !== null) {
      current.lines.push(line);
    }
  }
  return sections;
}

/** `key=value` lines of a section as a map with lower-case keys. */
function keyValues(section: Section | undefined): Map<string, string> {
  const values: Map<string, string> = new Map();
  for (const line of section?.lines ?? []) {
    const at: number = line.indexOf('=');
    if (at > 0) {
      values.set(
        line.slice(0, at).trim().toLowerCase(),
        line.slice(at + 1).trim()
      );
    }
  }
  return values;
}

/**
 * Reads an LMS answer to GetParam: `error=0`, `error_text=...`, `version=...`
 * and `aicc_data=` followed by the `[Core]`, `[Core_Lesson]` and
 * `[Student_Data]` sections.
 */
export function parseGetParamResponse(text: string): Result<AiccParams> {
  const marker: number = text.search(/aicc_data=/i);
  const head: string = marker < 0 ? text : text.slice(0, marker);
  const headValues: Map<string, string> = keyValues({
    name: '',
    lines: head.split(/\r\n|\r|\n/),
  });
  const code: string = headValues.get('error') ?? '';
  if (code !== '0') {
    return fail(
      `the AICC LMS refused the request with error ${code === '' ? '(none given)' : code}: ${headValues.get('error_text') ?? 'no text given'}`
    );
  }
  const body: string =
    marker < 0 ? '' : text.slice(marker + 'aicc_data='.length);
  const sections: Section[] = sectionsOf(body);
  const find = (name: string): Section | undefined =>
    sections.find((section: Section): boolean => section.name === name);
  const core: Map<string, string> = keyValues(find('core'));
  const lesson: string = (find('core_lesson')?.lines ?? [])
    .join('\n')
    .replace(/^\s+|\s+$/g, '');
  const student: Map<string, string> = keyValues(find('student_data'));
  const mastery: number = Number(student.get('mastery_score'));
  const location: string = core.get('lesson_location') ?? '';
  return {
    ok: true,
    value: {
      location: location === '' ? null : location,
      status: readLessonStatus(core.get('lesson_status') ?? ''),
      suspendData: lesson === '' ? null : lesson,
      masteryScore:
        student.has('mastery_score') && Number.isFinite(mastery)
          ? mastery
          : null,
    },
  };
}

/** Seconds as the `HH:MM:SS` time AICC expects. */
export function formatAiccTime(totalSeconds: number): string {
  const whole: number = Math.round(Math.max(0, totalSeconds));
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
}

const STATUS_WORDS: Readonly<Record<LessonStatus, string>> = {
  incomplete: 'Incomplete',
  completed: 'Completed',
  passed: 'Passed',
  failed: 'Failed',
};

/** Adapter for an AICC AU talking HACP (HTTP AICC Communication Protocol). */
export function createAiccAdapter(
  launch: AiccLaunch,
  environment: XapiEnvironment
): RuntimeAdapter {
  let queue: Promise<void> = Promise.resolve();
  let status: LessonStatus | null = null;
  let location = '';
  let suspendData = '';
  let score: Score | null = null;
  let startedAt = 0;
  let terminated = false;

  function form(command: string, data: string | null): string {
    return new URLSearchParams({
      command,
      version: HACP_VERSION,
      session_id: launch.sessionId,
      ...(data === null ? {} : { aicc_data: data }),
    }).toString();
  }

  function post(command: string, data: string | null) {
    return environment.fetch(launch.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(command, data),
      keepalive: true,
    });
  }

  /** Queues a request behind earlier ones and reports a refusal on the console. */
  function enqueue(command: string, data: string | null): void {
    queue = queue
      .then(async (): Promise<void> => {
        const response = await post(command, data);
        const text: string = await response.text();
        if (!response.ok) {
          throw new Error(`the LMS answered ${response.status}: ${text}`);
        }
        const answer: Map<string, string> = keyValues({
          name: '',
          lines: text.split(/\r\n|\r|\n/),
        });
        if ((answer.get('error') ?? '0') !== '0') {
          throw new Error(
            `error ${answer.get('error')}: ${answer.get('error_text') ?? 'no text given'}`
          );
        }
      })
      .catch((cause: unknown): void => {
        const reason: string =
          cause instanceof Error ? cause.message : String(cause);
        console.error(`[lms-package] AICC ${command} failed: ${reason}`);
      });
  }

  function coreData(exit: string | null, sessionSeconds: number): string {
    const lessonStatus: string =
      status === null
        ? 'Not Attempted'
        : `${STATUS_WORDS[status]}${exit === null ? '' : `,${exit}`}`;
    const lines: string[] = [
      '[Core]',
      `Lesson_Location=${location}`,
      `Lesson_Status=${lessonStatus}`,
      ...(score === null
        ? []
        : [`Score=${score.raw},${score.max},${score.min}`]),
      `Time=${formatAiccTime(sessionSeconds)}`,
      '[Core_Lesson]',
      suspendData,
    ];
    return `${lines.join('\r\n')}\r\n`;
  }

  function put(): Result<null> {
    enqueue(
      'PutParam',
      coreData(null, (environment.now().getTime() - startedAt) / 1000)
    );
    return ok();
  }

  return {
    name: 'aicc',
    initialize: () =>
      fail('the AICC adapter starts asynchronously; use start()'),
    async initializeAsync(): Promise<Result<InitialState>> {
      let params: Result<AiccParams>;
      try {
        const response = await post('GetParam', null);
        const text: string = await response.text();
        if (!response.ok) {
          return fail(
            `AICC GetParam failed: the LMS at ${launch.url} answered ${response.status}`
          );
        }
        params = parseGetParamResponse(text);
      } catch (cause: unknown) {
        const reason: string =
          cause instanceof Error ? cause.message : String(cause);
        return fail(`AICC could not reach the LMS at ${launch.url}: ${reason}`);
      }
      if (!params.ok) {
        return params;
      }
      startedAt = environment.now().getTime();
      status = params.value.status;
      location = params.value.location ?? '';
      suspendData = params.value.suspendData ?? '';
      return {
        ok: true,
        value: {
          location: params.value.location,
          suspendData: params.value.suspendData,
          status: params.value.status,
        },
      };
    },
    setLocation(value: string): Result<null> {
      if (value.length > LOCATION_LIMIT) {
        return fail(
          `AICC Lesson_Location holds at most ${LOCATION_LIMIT} characters, got ${value.length}`
        );
      }
      location = value;
      return put();
    },
    setSuspendData(value: string): Result<null> {
      if (value.length > SUSPEND_DATA_LIMIT) {
        return fail(
          `AICC suspend data holds at most ${SUSPEND_DATA_LIMIT} characters, got ${value.length}`
        );
      }
      if (/^\s*\[/m.test(value)) {
        return fail(
          'AICC suspend data must not have a line that starts with "[", because it would read as a new section'
        );
      }
      suspendData = value;
      return put();
    },
    // AICC has no progress measure; the status carries completion.
    setProgress: ok,
    setScore(value: Score): Result<null> {
      score = value;
      return put();
    },
    setStatus(value: LessonStatus): Result<null> {
      status = value;
      return put();
    },
    terminate(): Result<null> {
      if (terminated) {
        return ok();
      }
      terminated = true;
      const finished: boolean =
        status === 'completed' || status === 'passed' || status === 'failed';
      const seconds: number = (environment.now().getTime() - startedAt) / 1000;
      // The last PutParam says how the AU is leaving, then ExitAU ends the session.
      enqueue('PutParam', coreData(finished ? null : 'Suspend', seconds));
      enqueue('ExitAU', null);
      return ok();
    },
    async finish(): Promise<Result<null>> {
      // Closing the window right after Exit must not lose PutParam or ExitAU.
      await queue;
      return ok();
    },
  };
}
