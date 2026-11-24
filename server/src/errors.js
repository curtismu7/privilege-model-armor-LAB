// Named errors. The API maps `status` to the HTTP status and answers { error: code, message }.
export class LabError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'LabError';
    this.code = code;
    this.status = status;
  }
}
export const invalidKeyConfig = (message) => new LabError('invalid_key_config', message);
export const invalidRequest = (message) => new LabError('invalid_request', message);
export const twoInspectors = () => new LabError('two_inspectors', 'a key has at most one external inspector: select one (selecting another replaces the first); two at once are refused', 400);
export const promptTooLarge = (max) => new LabError('prompt_too_large', `the prompt is over ${max} characters`, 413);
// The inspector answered, but not with findings the gateway can read. Never a pass (see guardPath.js).
export const malformedFindings = (why) => new LabError('inspector_malformed_findings', `the inspector returned findings the gateway cannot read: ${why}`, 502);
