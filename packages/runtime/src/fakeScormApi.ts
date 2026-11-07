import type { Scorm12Api } from './scorm12.js';
import type { Scorm2004Api } from './scorm2004.js';

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

/** In-memory SCORM 2004 API for tests. Records every call in `calls`. */
export class FakeScorm2004Api implements Scorm2004Api {
  readonly values: Map<string, string> = new Map<string, string>();
  readonly calls: string[] = [];
  failElement: string | null = null;

  Initialize(parameter: string): string {
    this.calls.push(`Initialize(${parameter})`);
    return 'true';
  }
  Terminate(parameter: string): string {
    this.calls.push(`Terminate(${parameter})`);
    return 'true';
  }
  GetValue(element: string): string {
    return this.values.get(element) ?? '';
  }
  SetValue(element: string, value: string): string {
    this.calls.push(`SetValue(${element},${value})`);
    if (element === this.failElement) {
      return 'false';
    }
    this.values.set(element, value);
    return 'true';
  }
  Commit(parameter: string): string {
    this.calls.push(`Commit(${parameter})`);
    return 'true';
  }
  GetLastError(): string {
    return this.failElement === null ? '0' : '406';
  }
  GetErrorString(errorCode: string): string {
    return errorCode === '406'
      ? 'Data Model Element Type Mismatch'
      : 'No Error';
  }
  GetDiagnostic(errorCode: string): string {
    return errorCode === '406' ? `bad value for ${this.failElement}` : '';
  }
}
