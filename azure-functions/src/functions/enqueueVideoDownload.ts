import { app } from "@azure/functions";
import { RequestEnqueueVideoDownload } from "../dtos/EnqueueVideoDownload.dto";
import { httpRequest, HttpRequestParams } from "../utils/httpRequest";
import { getOrCreateQueue, sendMessage } from "../utils/queue";

const QUEUE_NAME = "video-downloads";

async function handler({
  body,
}: HttpRequestParams<RequestEnqueueVideoDownload>) {
  const queue = await getOrCreateQueue(QUEUE_NAME);
  await sendMessage(queue, {
    installationId: body.installationId,
    mediaUrl: body.mediaUrl,
  });

  return null;
}

app.http("enqueueVideoDownload", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: httpRequest<RequestEnqueueVideoDownload>(
    RequestEnqueueVideoDownload,
    handler
  ),
});
