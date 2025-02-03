import { NodeServiceClient } from "./client";

export class NodeServiceClientMock extends NodeServiceClient {
  public request: any; // captured
  public error: Error; // to throw
  public response: any; // to return;

  public constructor() {
    super(undefined, undefined);
  }
  public async send(request: any): Promise<any> {
    this.request = request;
    if (this.error) {
      throw this.error;
    } else {
      return this.response;
    }
  }
}
