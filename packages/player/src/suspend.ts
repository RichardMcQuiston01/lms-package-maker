import type { Answers } from './quiz.js';

/** Everything the player remembers between sessions. */
export interface SavedProgress {
  readonly visited: readonly boolean[];
  /** Score of the latest completed attempt in percent, or null before the first one. */
  readonly lastPercent: number | null;
  readonly answers: Answers;
}

const FORMAT_MARK = 'v2';

/**
 * `v2;<visited bits>;<latest reported percent or ->;<answers>` where each answer is `-`
 * (not answered) or the picked choice positions as a base-36 bit mask.
 * This stays small: SCORM 1.2 allows only 4096 characters of suspend data.
 */
export function encodeProgress(progress: SavedProgress): string {
  const bits: string = progress.visited
    .map((seen: boolean): string => (seen ? '1' : '0'))
    .join('');
  const latest: string =
    progress.lastPercent === null ? '-' : String(progress.lastPercent);
  const answers: string = progress.answers
    .map((answer: readonly number[] | null): string =>
      answer === null
        ? '-'
        : answer
            .reduce(
              (mask: number, position: number): number =>
                mask | (1 << position),
              0
            )
            .toString(36)
    )
    .join(',');
  return [FORMAT_MARK, bits, latest, answers].join(';');
}

function emptyAnswers(count: number): (readonly number[] | null)[] {
  return new Array<readonly number[] | null>(count).fill(null);
}

/**
 * Reads what `encodeProgress` wrote. Older packages saved only the visited
 * bits (a string of 0 and 1), which still works. Anything unreadable gives a
 * fresh start instead of an error.
 */
export function decodeProgress(
  saved: string | null,
  pageCount: number,
  questionCount: number
): SavedProgress {
  const visited: boolean[] = new Array<boolean>(pageCount).fill(false);
  const fresh: SavedProgress = {
    visited,
    lastPercent: null,
    answers: emptyAnswers(questionCount),
  };
  if (saved === null || saved === '') {
    return fresh;
  }
  const readBits = (bits: string): boolean[] => {
    const result: boolean[] = new Array<boolean>(pageCount).fill(false);
    for (let index = 0; index < Math.min(pageCount, bits.length); index += 1) {
      result[index] = bits.charAt(index) === '1';
    }
    return result;
  };
  if (/^[01]*$/.test(saved)) {
    return { ...fresh, visited: readBits(saved) };
  }
  const parts: string[] = saved.split(';');
  if (
    parts.length !== 4 ||
    parts[0] !== FORMAT_MARK ||
    !/^[01]*$/.test(parts[1] ?? '')
  ) {
    return fresh;
  }
  const latest: number = Number(parts[2]);
  const answers: (readonly number[] | null)[] = emptyAnswers(questionCount);
  (parts[3] ?? '').split(',').forEach((token: string, index: number): void => {
    if (index >= questionCount || token === '-' || token === '') {
      return;
    }
    const mask: number = parseInt(token, 36);
    if (!Number.isFinite(mask)) {
      return;
    }
    const picked: number[] = [];
    for (let position = 0; position < 10; position += 1) {
      if ((mask & (1 << position)) !== 0) picked.push(position);
    }
    answers[index] = picked;
  });
  return {
    visited: readBits(parts[1] ?? ''),
    lastPercent: parts[2] === '-' || !Number.isFinite(latest) ? null : latest,
    answers,
  };
}
