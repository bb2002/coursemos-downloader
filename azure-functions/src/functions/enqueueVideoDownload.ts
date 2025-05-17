import { app } from "@azure/functions";
import { RequestEnqueueVideoDownload } from "../dtos/EnqueueVideoDownload.dto";
import { httpRequest, HttpRequestParams } from "../utils/httpRequest";
import { getOrCreateQueue, sendMessage } from "../utils/queue";
import { getOrCreateTable } from "../utils/table";
import { differenceInSeconds, subHours, subSeconds } from "date-fns";
import { TooManyRequestsError } from "../utils/httpException";
import getIPAddress from "../utils/getIPAddress";
import randomString from "../utils/randomString";
import VideoProcessQueueItem from "../types/VideoProcessQueueItem";
import {
  PROCESSES_VIDEO_TABLE,
  QUEUE_NAME,
  VIDEO_PROCESS_REQUESTS_TABLE,
} from "../utils/constant";
import { isContext } from "vm";
import hash from "../utils/hash";

interface InsertVideoProcessRequestParams {
  installationId: string;
  blobId: string;
  ipAddress: string;
  status: string;
}

export async function insertVideoProcessRequest({
  installationId,
  blobId,
  ipAddress,
  status,
}: InsertVideoProcessRequestParams) {
  const client = await getOrCreateTable(VIDEO_PROCESS_REQUESTS_TABLE);
  return client.createEntity({
    partitionKey: installationId,
    rowKey: randomString(32),
    blobId: blobId,
    ipAddress: ipAddress,
    status: status,
  });
}

export async function getLatestVideoProcessRequest(installationId: string) {
  const client = await getOrCreateTable(VIDEO_PROCESS_REQUESTS_TABLE);

  const iterator = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${installationId}'`,
    },
  });

  let latestEntity = null;

  for await (const entity of iterator) {
    const currentTs = new Date(entity.timestamp as string);
    const latestTs = latestEntity
      ? new Date(latestEntity.timestamp as string)
      : null;

    if (!latestEntity || currentTs > latestTs) {
      latestEntity = entity;
    }
  }

  return latestEntity;
}

export async function getLatestProcessedVideo(mediaUrl: string) {
  const client = await getOrCreateTable(PROCESSES_VIDEO_TABLE);
  const partitionKey = hash(mediaUrl);
  const elevenHoursAgo = subHours(new Date(), 11);

  const iterator = client.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${partitionKey}'`,
    },
  });

  for await (const entity of iterator) {
    const ts = new Date(entity.timestamp as string);
    if (ts >= elevenHoursAgo) {
      return entity;
    }
  }
  return null;
}

async function fun({
  body,
  request,
}: HttpRequestParams<RequestEnqueueVideoDownload>) {
  const latestRequest = await getLatestVideoProcessRequest(body.installationId);
  if (latestRequest) {
    const secondsAgo = differenceInSeconds(
      new Date(),
      new Date(latestRequest.timestamp as string)
    );
    if (secondsAgo <= 3) {
      throw new TooManyRequestsError();
    }
  }
  console.log("latestRequest", latestRequest);

  const latestProcessedVideo = await getLatestProcessedVideo(body.mediaUrl);
  const blobId = randomString(32);
  if (!latestProcessedVideo) {
    const queue = await getOrCreateQueue(QUEUE_NAME);
    await sendMessage(queue, {
      installationId: body.installationId,
      mediaUrl: body.mediaUrl,
      blobId: blobId,
      mediaName: body.mediaName,
    } as VideoProcessQueueItem);
  }
  console.log("latestProcessedVideo", latestProcessedVideo);

  const data = {
    installationId: body.installationId,
    blobId: latestProcessedVideo ? latestProcessedVideo.rowKey : blobId,
    ipAddress: getIPAddress(request),
    status: latestProcessedVideo ? "COMPLETED" : "QUEUED",
  };
  await insertVideoProcessRequest(data);
  return data;
}

app.http("enqueueVideoDownload", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: httpRequest<RequestEnqueueVideoDownload>(
    RequestEnqueueVideoDownload,
    fun
  ),
});
