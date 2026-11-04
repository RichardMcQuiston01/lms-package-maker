import type { Scorm12Api } from './scorm12.js';

/** In-memory SCORM 1.2 API for tests. Records every call in `calls`. */
export class FakeScorm12Api implements Scorm12Api {
  readonly values: Map<string, string> = new Map<string, string>();
  readonly calls: string[] = [];
  failElement: string | null = null;

  LMSInitialize(parameter: string): string {
    this.calls.push(`LMSInitialize(${parameter})`);
    return 'true';
  }
  LMSFinish(parameter: string): string {
    this.calls.push(`LMSFinish(${parameter})`);
    return 'true';
  }
  LMSGetValue(element: string): string {
    return this.values.get(element) ?? '';
  }
  LMSSetValue(element: string, value: string): string {
    this.calls.push(`LMSSetValue(${element},${value})`);
    if (element === this.failElement) {
      return 'false';
    }
    this.values.set(element, value);
    return 'true';
  }
  LMSCommit(parameter: string): string {
    this.calls.push(`LMSCommit(${parameter})`);
    return 'true';
  }
  LMSGetLastError(): string {
    return this.failElement === null ? '0' : '405';
  }
  LMSGetErrorString(errorCode: string): string {
    return errorCode === '405' ? 'Incorrect Data Type' : 'No error';
  }
}
