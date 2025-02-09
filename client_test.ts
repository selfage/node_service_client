import express = require("express");
import http = require("http");
import { NodeServiceClient } from "./client";
import {
  GET_COMMENTS_REQUEST_BODY,
  GET_COMMENTS_RESPONSE,
  newGetCommentsRequest,
} from "./test_data/get_comments";
import { NODE_SERVICE } from "./test_data/node_service";
import {
  UPLOAD_FILE_REQUEST_METADATA,
  UPLOAD_FILE_RESPONSE,
  newUploadFileRequest,
} from "./test_data/upload_file";
import { StatusCode, newInternalServerErrorError } from "@selfage/http_error";
import { eqHttpError } from "@selfage/http_error/test_matcher";
import {
  deserializeMessage,
  serializeMessage,
} from "@selfage/message/serializer";
import { destringifyMessage } from "@selfage/message/stringifier";
import { eqMessage } from "@selfage/message/test_matcher";
import { ClientType } from "@selfage/service_descriptor/client_type";
import { assertReject, assertThat, eq, eqError } from "@selfage/test_matcher";
import { TEST_RUNNER, TestCase } from "@selfage/test_runner";
import { createReadStream } from "fs";

let HOSTNAME = "localhost";

function setCorsHeader(res: express.Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

async function createServer(app: express.Express): Promise<http.Server> {
  let server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(NODE_SERVICE.port, () => resolve());
  });
  app.options("/*", (req, res) => {
    setCorsHeader(res);
    res.send("ok");
  });
  return server;
}

async function closeServer(server?: http.Server): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }
}

TEST_RUNNER.run({
  name: "ClientTest",
  cases: [
    new (class implements TestCase {
      public name = "GetComments";
      private server: http.Server;
      public async execute() {
        // Prepare
        let app = express();
        this.server = await createServer(app);
        app.post("/GetComments", express.raw(), (req, res) => {
          assertThat(
            deserializeMessage(req.body, GET_COMMENTS_REQUEST_BODY),
            eqMessage({ videoId: "aaaaa" }, GET_COMMENTS_REQUEST_BODY),
            "request body",
          );
          res.end(
            serializeMessage({ texts: ["1", "2", "3"] }, GET_COMMENTS_RESPONSE),
          );
        });
        let client = NodeServiceClient.create({
          clientType: ClientType.NODE,
          nameToHostnames: new Map([["NodeService", HOSTNAME]]),
        });

        // Execute
        let actualResponse = await client.send(
          newGetCommentsRequest({ videoId: "aaaaa" }),
        );

        // Verify
        assertThat(
          actualResponse,
          eqMessage({ texts: ["1", "2", "3"] }, GET_COMMENTS_RESPONSE),
          "response",
        );
      }
      public async tearDown() {
        await closeServer(this.server);
      }
    })(),
    new (class implements TestCase {
      public name = "GetCommentsServerError";
      private server: http.Server;
      public async execute() {
        // Prepare
        let app = express();
        this.server = await createServer(app);
        app.post("/GetComments", express.raw(), (req, res) => {
          setCorsHeader(res);
          res.sendStatus(StatusCode.InternalServerError);
        });
        let client = NodeServiceClient.create({
          clientType: ClientType.NODE,
          nameToHostnames: new Map([["NodeService", HOSTNAME]]),
        });

        let httpErrors = 0;
        let errors = 0;
        client.on("httpError", (error) => {
          httpErrors++;
          assertThat(
            error,
            eqHttpError(newInternalServerErrorError("Internal")),
            "http error",
          );
        });
        client.on("error", (error) => {
          errors++;
          assertThat(
            error,
            eqHttpError(newInternalServerErrorError("Internal")),
            "error",
          );
        });

        // Execute
        let error = await assertReject(
          client.send(newGetCommentsRequest({ videoId: "any" })),
        );

        // Verify
        assertThat(httpErrors, eq(1), `onHttpError counter`);
        assertThat(errors, eq(1), `onError counter`);
        assertThat(
          error,
          eqHttpError(newInternalServerErrorError("Internal")),
          "response error",
        );
      }
      public async tearDown() {
        await closeServer(this.server);
      }
    })(),
    new (class implements TestCase {
      public name = "GetCommentsResponseError";
      private server: http.Server;
      public async execute() {
        // Prepare
        let app = express();
        this.server = await createServer(app);
        app.post("/GetComments", express.raw(), (req, res) => {
          setCorsHeader(res);
          res.end("random string");
        });
        let client = NodeServiceClient.create({
          clientType: ClientType.NODE,
          nameToHostnames: new Map([["NodeService", HOSTNAME]]),
        });

        let errors = 0;
        client.on("error", (error) => {
          errors++;
          assertThat(
            error,
            eqError(new Error("Unable to parse")),
            "response error",
          );
        });

        // Execute
        let error = await assertReject(
          client.send(newGetCommentsRequest({ videoId: "any" })),
        );

        // Verify
        assertThat(errors, eq(1), `onError counter`);
        assertThat(
          error,
          eqError(new Error("Unable to parse")),
          "response error",
        );
      }
      public async tearDown() {
        await closeServer(this.server);
      }
    })(),
    new (class implements TestCase {
      public name = "GetCommentsTimeout";
      private server: http.Server;
      public async execute() {
        // Prepare
        let app = express();
        this.server = await createServer(app);
        app.post("/GetComments", express.raw(), (req, res) => {
          // Hang forever.
        });
        let client = NodeServiceClient.create({
          clientType: ClientType.NODE,
          nameToHostnames: new Map([["NodeService", HOSTNAME]]),
        });

        let errors = 0;
        client.on("error", (error) => {
          errors++;
          assertThat(
            error,
            eqError(new Error("Http request timed out")),
            "error",
          );
        });

        // Execute
        let error = await assertReject(
          client.send(newGetCommentsRequest({ videoId: "any" }), {
            retries: 10,
            timeout: 50,
          }),
        );

        // Verify
        assertThat(errors, eq(1), `onError counter`);
        assertThat(
          error,
          eqError(new Error("Http request timed out")),
          "response error",
        );
      }
      public async tearDown() {
        await closeServer(this.server);
      }
    })(),
    new (class implements TestCase {
      public name = "GetCommentsExhaustedRetries";
      public async execute() {
        // Prepare
        let client = NodeServiceClient.create({
          clientType: ClientType.NODE,
          nameToHostnames: new Map([["NodeService", HOSTNAME]]),
        });
        let errors = 0;
        client.on("error", (error) => {
          errors++;
          assertThat(
            error,
            eqError(new Error("Http request failed after 3 attempts")),
            "error",
          );
        });

        // Execute
        let error = await assertReject(
          client.send(newGetCommentsRequest({ videoId: "any" }), {
            retries: 3,
          }),
        );

        // Verify
        assertThat(errors, eq(1), `onError counter`);
        assertThat(
          error,
          eqError(new Error("Http request failed after 3 attempts")),
          "response error",
        );
      }
    })(),
    new (class implements TestCase {
      public name = "UploadFile";
      private server: http.Server;
      public async execute() {
        // Prepare
        let app = express();
        this.server = await createServer(app);
        app.post("/UploadFile", express.text({ type: "*/*" }), (req, res) => {
          setCorsHeader(res);
          assertThat(
            destringifyMessage(
              req.query["sd"] as string,
              UPLOAD_FILE_REQUEST_METADATA,
            ),
            eqMessage({ fileName: "file1" }, UPLOAD_FILE_REQUEST_METADATA),
            "request side",
          );
          assertThat(req.body, eq("hahahah, random stuff"), "request body");
          res.end(
            serializeMessage(
              { byteSize: 10, success: true },
              UPLOAD_FILE_RESPONSE,
            ),
          );
        });
        let client = NodeServiceClient.create({
          clientType: ClientType.NODE,
          nameToHostnames: new Map([["NodeService", HOSTNAME]]),
        });

        // Execute
        let actualResponse = await client.send(
          newUploadFileRequest(createReadStream("./test_data/file.txt"), {
            fileName: "file1",
          }),
        );

        // Verify
        assertThat(
          actualResponse,
          eqMessage({ byteSize: 10, success: true }, UPLOAD_FILE_RESPONSE),
          "response",
        );
      }
      public async tearDown() {
        await closeServer(this.server);
      }
    })(),
  ],
});
