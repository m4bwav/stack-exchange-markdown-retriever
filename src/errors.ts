/**
Details a `StackExchangeError` can carry.
*/
export type StackExchangeErrorDetails = {
  /**
  The HTTP status of the response.
  */
  status: number;
  /**
  The API's `error_id`, when the response was an API error.
  */
  errorId?: number | undefined;
  /**
  The API's `error_name` (for example `bad_parameter` or `throttle_violation`), when the response was an API error.
  */
  errorName?: string | undefined;
  /**
  The underlying error, when the body could not be decompressed or parsed.
  */
  cause?: unknown;
};

/**
The Stack Exchange API answered with an error (its `error_message` is the message), or with a body that is not the API's JSON.
Network failures, timeouts and aborts are not wrapped: they arrive as the platform's own errors.
*/
export class StackExchangeError extends Error {
  /**
  The HTTP status of the response.
  */
  readonly status: number;

  /**
  The API's `error_id`, when the response was an API error.
  */
  readonly errorId: number | undefined;

  /**
  The API's `error_name`, when the response was an API error.
  */
  readonly errorName: string | undefined;

  constructor(message: string, details: StackExchangeErrorDetails) {
    super(message, details.cause === undefined ? undefined : {cause: details.cause});
    this.name = 'StackExchangeError';
    this.status = details.status;
    this.errorId = details.errorId;
    this.errorName = details.errorName;
  }
}
