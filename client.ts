import EventEmitter = require("events");
import getStream = require("get-stream");
import http = require("http");
import { HttpError, newBadRequestError } from "@selfage/http_error";
import {
  deserializeMessage,
  serializeMessage,
} from "@selfage/message/serializer";
import { stringifyMessage } from "@selfage/message/stringifier";
import {
  NodeRemoteCallDescriptor,
  PrimitveTypeForBody,
} from "@selfage/service_descriptor";
import {
  NodeClientInterface,
  NodeClientOptions,
} from "@selfage/service_descriptor/client_interface";

type WriteBodyFunction = (req: http.ClientRequest) => void;

export interface NodeServiceClient {
  // When server finished response with an error code, i.e. either 4xx or 5xx.
  on(
    event: "httpError",
    listener: (error: HttpError) => Promise<void> | void,
  ): this;
  // General errors including http errors and network errors.
  on(event: "error", listener: (error: any) => Promise<void> | void): this;
}

export class NodeServiceClient
  extends EventEmitter
  implements NodeClientInterface
{
  public static create(): NodeServiceClient {
    return new NodeServiceClient((callback, ms) => setTimeout(callback, ms));
  }

  // Include origin and path, prior to any remote call path.
  public baseUrl: string;

  public constructor(
    private setTimeout: (callback: Function, ms: number) => number,
  ) {
    super();
  }

  public async send(request: any, options?: NodeClientOptions): Promise<any> {
    try {
      return await this.sendOrThrowErrors(request, options);
    } catch (e) {
      if (e.statusCode) {
        await Promise.all(
          this.listeners("httpError").map((callback) => callback(e)),
        );
      }
      await Promise.all(this.listeners("error").map((callback) => callback(e)));
      throw e;
    }
  }

  private async sendOrThrowErrors(
    request: any,
    options: NodeClientOptions = {},
  ): Promise<any> {
    let remoteCallDescriptor = request.descriptor as NodeRemoteCallDescriptor;
    let headers: http.OutgoingHttpHeaders = {};
    let searchParams = new URLSearchParams();
    if (request.metadata) {
      searchParams.set(
        remoteCallDescriptor.metadata.key,
        stringifyMessage(request.metadata, remoteCallDescriptor.metadata.type),
      );
    }

    let writeBody: WriteBodyFunction;
    if (remoteCallDescriptor.body.messageType) {
      headers["content-type"] = "application/octet-stream";
      writeBody = (req) => {
        req.end(
          serializeMessage(request.body, remoteCallDescriptor.body.messageType),
        );
      };
    } else if (
      remoteCallDescriptor.body.primitiveType === PrimitveTypeForBody.BYTES
    ) {
      headers["content-type"] = "application/octet-stream";
      writeBody = (req) => {
        request.body.pipe(req);
      };
    } else {
      throw newBadRequestError("Unsupported client request body.");
    }

    let httpResponse = await this.requestWithTimeoutAndRetries(
      remoteCallDescriptor.path,
      searchParams,
      writeBody,
      headers,
      options.retries,
      options.timeout,
    );
    if (httpResponse.statusCode !== 200) {
      let errorMessage = await getStream(httpResponse, {
        encoding: "utf-8",
      });
      throw new HttpError(httpResponse.statusCode, errorMessage);
    }

    try {
      return deserializeMessage(
        await getStream.buffer(httpResponse),
        remoteCallDescriptor.response.messageType,
      );
    } catch (e) {
      throw new Error(`Unable to parse server response.`);
    }
  }

  private async requestWithTimeoutAndRetries(
    path: string,
    searchParams: URLSearchParams,
    writeBody: WriteBodyFunction,
    headers: http.OutgoingHttpHeaders,
    retries = 1,
    timeout?: number,
  ): Promise<http.IncomingMessage> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        let signal: AbortSignal;
        if (timeout) {
          let abortController = new AbortController();
          signal = abortController.signal;
          this.setTimeout(() => abortController.abort(), timeout);
        }
        let res = await new Promise<http.IncomingMessage>((resolve, reject) => {
          let req = http.request(
            `${this.baseUrl}${path}?${searchParams}`,
            {
              method: "POST",
              headers,
              timeout,
              signal,
            },
            (res) => resolve(res),
          );
          req.on("error", (e) => {
            reject(e);
          });
          writeBody(req);
        });
        return res;
      } catch (e) {
        if (e.code === "ABORT_ERR") {
          throw new Error("Http request timed out.");
        } else {
          lastError = e;
        }
      }
    }
    throw new Error(
      `Http request failed after ${retries} attempts. ${lastError}`,
    );
  }
}
