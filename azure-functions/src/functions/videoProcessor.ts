import { app, InvocationContext } from "@azure/functions";
import { writeFile, mkdir } from "fs/promises";
import { promisify } from "util";
import { execFile } from "child_process";
import * as path from "path";
import * as fs from "fs";
import randomString from "../utils/randomString";
import { generateSASUrl, getOrCreateBlob, uploadMP4Blob } from "../utils/blob";
import axios from "axios";
import VideoProcessQueueItem from "../types/VideoProcessQueueItem";
import { getOrCreateTable } from "../utils/table";
import {
  PROCESSES_VIDEO_TABLE,
  VIDEO_PROCESS_REQUESTS_TABLE,
} from "../utils/constant";
import hash from "../utils/hash";

const execFileAsync = promisify(execFile);
const CONTAINER_NAME = "videos";

interface UpdateVideoProcessResultParams {
  installationId: string;
  blobId: string;
  status?: string;
}

interface InsertVideoProcessRequestParams {
  mediaUrl: string;
  blobId: string;
  mediaName: string;
  sasUrl?: string;
}

export async function updateVideoProcessResult({
  blobId,
  installationId,
  status,
}: UpdateVideoProcessResultParams) {
  const client = await getOrCreateTable(VIDEO_PROCESS_REQUESTS_TABLE);
  return client.updateEntity(
    {
      partitionKey: installationId,
      rowKey: blobId,
      status: status,
    },
    "Merge"
  );
}

export async function insertProcessedVideo({
  blobId,
  mediaUrl,
  sasUrl,
  mediaName,
}: InsertVideoProcessRequestParams) {
  const client = await getOrCreateTable(PROCESSES_VIDEO_TABLE);
  return client.createEntity({
    partitionKey: hash(mediaUrl),
    rowKey: blobId,
    sasUrl: sasUrl,
    mediaName,
  });
}

export async function videoProcessor(
  { installationId, mediaUrl, blobId, mediaName }: VideoProcessQueueItem,
  context: InvocationContext
): Promise<void> {
  const baseUrl = `${mediaUrl.substring(0, mediaUrl.lastIndexOf("/") + 1)}`;
  const filename = mediaUrl.substring(mediaUrl.lastIndexOf("/") + 1);
  const downloadedSegments: string[] = [];

  let filenameFormat: string = null;
  if (filename.startsWith("media_")) {
    let parts = filename.split("_");
    parts[parts.length - 1] = "{n}.ts";
    filenameFormat = parts.join("_");
  }

  if (filename.startsWith("segment")) {
    let parts = filename.split("-");
    parts[1] = "{n}";
    filenameFormat = parts.join("-");
  }

  if (filenameFormat === null) {
    await updateVideoProcessResult({
      installationId: installationId,
      blobId: blobId,
      status: "FILRNAME_FORMAT_FAULT",
    });
    return;
  } else {
    await updateVideoProcessResult({
      installationId: installationId,
      blobId: blobId,
      status: "DOWNLOADING",
    });
  }

  const tempDirName = randomString(6);
  const tempDir = path.join("/tmp", tempDirName);
  await mkdir(tempDir, { recursive: true });

  let i = 1;
  while (true) {
    const segmentId = filenameFormat.replace("{n}", i++ + "");
    const segmentFilePath = path.join(tempDir, segmentId);

    try {
      const res = await axios.get(baseUrl + segmentId, {
        responseType: "arraybuffer",
        validateStatus: () => true,
      });

      if (res.status === 404) {
        break;
      }

      if (res.status >= 200 && res.status < 300) {
        const buffer = Buffer.from(res.data);
        await writeFile(segmentFilePath, buffer);
        downloadedSegments.push(segmentId);
        continue;
      }

      await updateVideoProcessResult({
        installationId: installationId,
        blobId: blobId,
        status: "DOWNLOAD_FAILED_WITH_" + res.status,
      });
      return;
    } catch (ex) {
      await updateVideoProcessResult({
        installationId: installationId,
        blobId: blobId,
        status: "DOWNLOAD_FAILED_NETWORK_ERROR",
      });
      return;
    }
  }

  const fileListPath = path.join(tempDir, "filelist.txt");
  await writeFile(
    fileListPath,
    downloadedSegments.map((fullPath) => `file '${fullPath}'`).join("\n"),
    "utf-8"
  );

  const ffmpegPath = path.join(__dirname, "..", "bin", "ffmpeg");
  const outputPath = path.join(tempDir, "output.mp4");
  await updateVideoProcessResult({
    installationId: installationId,
    blobId: blobId,
    status: "ENCODING",
  });

  try {
    await execFileAsync(ffmpegPath, [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      fileListPath,
      "-c",
      "copy",
      outputPath,
    ]);
  } catch (ex) {
    context.error("FFmpeg execution failed", ex);
    await updateVideoProcessResult({
      installationId: installationId,
      blobId: blobId,
      status: "ENCODING_FAULT",
    });
    return;
  }

  const fileBuffer = await fs.promises.readFile(outputPath);
  const containerClient = await getOrCreateBlob(CONTAINER_NAME);
  const uploadedBlobName = await uploadMP4Blob(containerClient, fileBuffer);
  const sasUrl = await generateSASUrl(CONTAINER_NAME, uploadedBlobName);
  await Promise.all([
    updateVideoProcessResult({
      installationId: installationId,
      blobId: blobId,
      status: "COMPLETED",
    }),
    insertProcessedVideo({
      mediaUrl: mediaUrl,
      blobId: blobId,
      mediaName: mediaName,
      sasUrl,
    }),
  ]);
}

app.storageQueue("videoProcessor", {
  queueName: "video-downloads",
  connection: "STORAGE_CONNECTION",
  handler: videoProcessor,
});
