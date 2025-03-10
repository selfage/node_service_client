import { NodeClientOptions, NodeServiceClient } from "./client";
import { ClientRequestInterface } from "@selfage/service_descriptor/client_request_interface";

export class NodeServiceClientMock extends NodeServiceClient {
  public request: any; // captured
  public error: Error; // to throw
  public response: any; // to return

  public constructor() {
    super(undefined, undefined);
  }
  public async send(
    request: ClientRequestInterface<any>,
    options?: NodeClientOptions,
  ): Promise<any> {
    this.request = request;
    if (this.error) {
      throw this.error;
    } else {
      return this.response;
    }
  }
}
