import {
  ok,
  type InitialState,
  type LessonStatus,
  type Result,
  type RuntimeAdapter,
  type Score,
} from './types.js';

/** Where progress messages go; a framed page's `window.parent`. */
export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** Fields of the reactive-lms `NormalizedProgress` this adapter sends. */
interface ProgressPayload {
  completionStatus?: 'incomplete' | 'completed';
  successStatus?: 'passed' | 'failed';
  progressMeasure?: number;
  scoreRaw?: number;
  scoreMin?: number;
  scoreMax?: number;
  location?: string;
  suspendData?: string;
}

/**
 * Adapter for plain HTML5 hosting. It posts the envelope reactive-lms reads:
 * `{ source: 'reactive-lms', type: 'progress' | 'complete', payload }`.
 * The target origin is `*` because the host page's origin is unknown at export
 * time; receivers must check `event.source` against their own iframe.
 */
export function createHtml5Adapter(target: MessageTarget): RuntimeAdapter {
  function send(
    type: 'progress' | 'complete',
    payload: ProgressPayload
  ): Result<null> {
    try {
      target.postMessage({ source: 'reactive-lms', type, payload }, '*');
      return ok();
    } catch (cause: unknown) {
      const reason: string =
        cause instanceof Error ? cause.message : String(cause);
      return { ok: false, error: `postMessage to host failed: ${reason}` };
    }
  }

  return {
    name: 'html5',
    initialize: (): Result<InitialState> => ({
      ok: true,
      value: { location: null, suspendData: null, status: null },
    }),
    setLocation: (location: string): Result<null> =>
      send('progress', { location }),
    setSuspendData: (suspendData: string): Result<null> =>
      send('progress', { suspendData }),
    setProgress: (measure: number): Result<null> =>
      send('progress', { progressMeasure: measure }),
    setScore: (score: Score): Result<null> =>
      send('progress', {
        scoreRaw: score.raw,
        scoreMin: score.min,
        scoreMax: score.max,
      }),
    setStatus(status: LessonStatus): Result<null> {
      switch (status) {
        case 'incomplete':
          return send('progress', { completionStatus: 'incomplete' });
        case 'completed':
          return send('complete', {});
        case 'passed':
          return send('complete', { successStatus: 'passed' });
        case 'failed':
          return send('progress', {
            completionStatus: 'incomplete',
            successStatus: 'failed',
          });
      }
    },
    terminate: ok,
  };
}
