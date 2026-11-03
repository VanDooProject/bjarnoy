// The river ripple solve, off the main thread.
//
// `computeRiverRipple` (riverFlow.ts) is pure CPU — a potential solve, a stream
// function and a geodesic distance per cell — and a freshly founded settlement
// asks for every visible river cell in one go. Solved inline that is a
// multi-second main-thread block in which polls, clicks and the ring menu all
// freeze; here it is the same work with the page still answering, and the
// river drawn without flow on a hex until that hex's cell lands.
//
// The input is plain objects and Uint8Arrays, so it structured-clones as is.
import { computeRiverRipple, type RiverFlowInput } from './riverFlow';

export interface RippleRequest {
  /** Echoed back so the main thread can match the reply to the cell it asked for. */
  id: number;
  input: RiverFlowInput;
}

export interface RippleResponse {
  id: number;
  data: Uint8Array;
  psi: Uint8Array;
  inside: Uint8Array;
  periods: number;
}

self.onmessage = (event: MessageEvent<RippleRequest>) => {
  const { id, input } = event.data;
  const { data, psi, inside, periods } = computeRiverRipple(input);
  const response: RippleResponse = { id, data, psi, inside, periods };
  (self as unknown as Worker).postMessage(response, [data.buffer, psi.buffer, inside.buffer]);
};
