import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { RequestEnqueueVideoDownload } from "../dtos/EnqueueVideoDownload.dto";

const enqueueVideoDownload = httpRequest<RequestEnqueueVideoDownload>(
  async () => {}
);

// export async function enqueueVideoDownload(
//   request: HttpRequest,
//   context: InvocationContext
// ): Promise<HttpResponseInit> {
//   const json = await request.json();

// }

app.http("enqueueVideoDownload", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: enqueueVideoDownload,
});
