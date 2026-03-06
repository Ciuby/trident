import { executeWorkerRequest, type WorkerRequest, type WorkerResponse } from "@web-hammer/workers";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const response: WorkerResponse = executeWorkerRequest(event.data);
  self.postMessage(response);
};

export {};
