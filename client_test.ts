import express = require("express");
import http = require("http");
import { NodeServiceClient } from "./client";
import {
  GET_COMMENTS_REQUEST_BODY,
  GET_COMMENTS_RESPONSE,
  getComments,
} from "./test_data/get_comments";
import {
  UPLOAD_FILE_REQUEST_METADATA,
  UPLOAD_FILE_RESPONSE,
  uploadFile,
} from "./test_data/upload_file";
import { StatusCode, newInternalServerErrorError } from "@selfage/http_error";
import { eqHttpError } from "@selfage/http_error/test_matcher";
import {
  destringifyMessage,
  stringifyMessage,
} from "@selfage/message/stringifier";
import { eqMessage } from "@selfage/message/test_matcher";
import { assertReject, assertThat, eq, eqError } from "@selfage/test_matcher";
import { TEST_RUNNER, TestCase } from "@selfage/test_runner";
import { createReadStream } from "fs";

let HOST_NAME = "localhost";
let PORT = 8080;
let ORIGIN = `http://${HOST_NAME}:${PORT}`;

function setCorsHeader(res: express.Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

async function createServer(app: express.Express): Promise<http.Server> {
  let server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen({ host: HOST_NAME, port: PORT }, () => resolve());
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
        app.post("/GetComments", express.text(), (req, res) => {
          assertThat(
            destringifyMessage(req.body, GET_COMMENTS_REQUEST_BODY),
            eqMessage({ videoId: "aaaaa" }, GET_COMMENTS_REQUEST_BODY),
            "request body",
          );
          res.end(
            stringifyMessage({ texts: ["1", "2", "3"] }, GET_COMMENTS_RESPONSE),
          );
        });
        let client = NodeServiceClient.create();
        client.baseUrl = ORIGIN;

        // Execute
        let actualResponse = await getComments(client, { videoId: "aaaaa" });

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
        app.post("/GetComments", express.text(), (req, res) => {
          setCorsHeader(res);
          res.sendStatus(StatusCode.InternalServerError);
        });
        let client = NodeServiceClient.create();
        client.baseUrl = ORIGIN;

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
        let error = await assertReject(getComments(client, { videoId: "any" }));

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
        app.post("/GetComments", express.text(), (req, res) => {
          setCorsHeader(res);
          res.end("random string");
        });
        let client = NodeServiceClient.create();
        client.baseUrl = ORIGIN;

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
        let error = await assertReject(getComments(client, { videoId: "any" }));

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
        app.post("/GetComments", express.text(), (req, res) => {
          // Hang forever.
        });
        let client = NodeServiceClient.create();
        client.baseUrl = ORIGIN;

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
          getComments(
            client,
            { videoId: "any" },
            {
              retries: 10,
              timeout: 50,
            },
          ),
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
        let client = NodeServiceClient.create();
        client.baseUrl = ORIGIN;
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
          getComments(
            client,
            { videoId: "any" },
            {
              retries: 3,
            },
          ),
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
            stringifyMessage(
              { byteSize: 10, success: true },
              UPLOAD_FILE_RESPONSE,
            ),
          );
        });
        let client = NodeServiceClient.create();
        client.baseUrl = ORIGIN;

        // Execute
        let actualResponse = await uploadFile(
          client,
          createReadStream("./test_data/file.txt"),
          { fileName: "file1" },
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
