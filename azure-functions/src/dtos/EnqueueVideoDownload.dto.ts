import { IsUrl, IsUUID } from "class-validator";

export class RequestEnqueueVideoDownload {
  @IsUUID()
  installationId: string;

  @IsUrl()
  mediaUrl: string;
}
