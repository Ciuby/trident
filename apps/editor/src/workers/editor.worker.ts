import { executeWorkerRequest, type WorkerRequest, type WorkerResponse } from "@gg-ez/workers";

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const response: WorkerResponse = await executeWorkerRequest(event.data);
  self.postMessage(response);
};

export {};
