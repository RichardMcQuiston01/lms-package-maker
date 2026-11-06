/** Why a service call failed, so callers can pick an HTTP status or a message. */
export type ServiceResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | {
      readonly ok: false;
      readonly kind: 'invalid' | 'notFound' | 'tooLarge' | 'failed';
      readonly errors: readonly string[];
    };
