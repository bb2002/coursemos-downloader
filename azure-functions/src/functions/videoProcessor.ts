import { app, InvocationContext } from "@azure/functions";

export async function videoProcessor(
  queueItem: unknown,
  context: InvocationContext
): Promise<void> {
  context.log("Storage queue function processed work item:", queueItem);
}

app.storageQueue("videoProcessor", {
  queueName: "video-downloads",
  connection: "STORAGE_CONNECTION",
  handler: videoProcessor,
});
