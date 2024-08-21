import { MessageDescriptor, PrimitiveType } from "@selfage/message/descriptor";
import {
  NodeRemoteCallDescriptor,
  PrimitveTypeForBody,
} from "@selfage/service_descriptor";
import {
  NodeClientInterface,
  NodeClientOptions,
} from "@selfage/service_descriptor/client_interface";
import { Readable } from "stream";

export interface UploadFileRequestMetadata {
  fileName: string;
}

export let UPLOAD_FILE_REQUEST_METADATA: MessageDescriptor<UploadFileRequestMetadata> =
  {
    name: "UploadFileRequestMetadata",
    fields: [
      {
        name: "fileName",
        index: 1,
        primitiveType: PrimitiveType.STRING,
      },
    ],
  };

export interface UploadFileResponse {
  byteSize: number;
  success: boolean;
}

export let UPLOAD_FILE_RESPONSE: MessageDescriptor<UploadFileResponse> = {
  name: "UploadFileResponse",
  fields: [
    {
      name: "byteSize",
      index: 1,
      primitiveType: PrimitiveType.NUMBER,
    },
    {
      name: "success",
      index: 2,
      primitiveType: PrimitiveType.BOOLEAN,
    },
  ],
};

export let UPLOAD_FILE: NodeRemoteCallDescriptor = {
  name: "UploadFile",
  path: "/UploadFile",
  metadata: {
    key: "sd",
    type: UPLOAD_FILE_REQUEST_METADATA,
  },
  body: {
    primitiveType: PrimitveTypeForBody.BYTES,
  },
  response: {
    messageType: UPLOAD_FILE_RESPONSE,
  },
};

export function uploadFile(
  client: NodeClientInterface,
  body: Readable,
  metadata: UploadFileRequestMetadata,
  options?: NodeClientOptions,
): Promise<UploadFileResponse> {
  return client.send(
    {
      descriptor: UPLOAD_FILE,
      body,
      metadata,
    },
    options,
  );
}
