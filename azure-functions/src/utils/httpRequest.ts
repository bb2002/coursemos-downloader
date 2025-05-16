import {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { ClassConstructor, plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import { HttpException } from "./httpException";

type HttpRequestFunction = (
  request: HttpRequest,
  context: InvocationContext
) => Promise<HttpResponseInit>;

type HttpRequestParams<T> = {
  request: HttpRequest;
  context: InvocationContext;
  body: T;
};

export function httpRequest<T extends object>(
  inDto: ClassConstructor<T>,
  fun: (params: HttpRequestParams<T>) => Promise<HttpResponseInit>
): HttpRequestFunction {
  return async (request: HttpRequest, context: InvocationContext) => {
    let body: T;
    try {
      const raw = await request.json();
      body = plainToInstance(inDto, raw);
      await validateOrReject(body);
    } catch (ex) {
      return {
        status: 400,
        body: {
          error: "Bad Request",
          message: "Invalid request body",
        },
      };
    }

    let result: HttpResponseInit;
    try {
      result = await fun({ request, context, body });
      return {
        ...result,
        headers: {
          "Content-Type": "application/json",
          ...result.headers,
        },
      };
    } catch (ex) {
      if (ex instanceof HttpException) {
        return {
          status: ex.status,
          body: {
            message: ex.message,
            details: ex.details,
          },
        };
      }

      return {
        status: 500,
        body: {
          message: "Internal Server Error",
        },
      };
    }
  };
}
