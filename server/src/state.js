// The only server state: one lab (clock, model stub, the key and its inspector) and a short log of runs, so Reset has something to clear. Bounded.
import { createClock } from './model-gateway-sim/labClock.js';
import { createLlmKey } from './model-gateway-sim/llmKey.js';
import { createProvider } from './model-gateway-sim/providerStub.js';
import { BOUNDS } from './bounds.js';
import { createKeyInspector } from './keyInspector.js';
import { createModel } from './model.js';

export function createLab() {
  const clock = createClock(0);
  const provider = createProvider({ id: 'model-stub', model: 'stub-model' }, clock);
  return {
    clock,
    model: createModel(provider),
    llmKey: createLlmKey({ id: 'key-1', budgetTokens: Number.MAX_SAFE_INTEGER }), // no credential field exists on the kit's key
    keyInspector: createKeyInspector(),
    runs: [],
    gatewayLog: [],
    record(result) {
      this.runs.push({ outcome: result.outcome, inspector: result.key.inspector });
      if (this.runs.length > BOUNDS.maxLogKept) this.runs = this.runs.slice(-BOUNDS.maxLogKept);
      this.gatewayLog.push(...result.logged);
      if (this.gatewayLog.length > BOUNDS.maxLogKept) this.gatewayLog = this.gatewayLog.slice(-BOUNDS.maxLogKept);
    },
  };
}
