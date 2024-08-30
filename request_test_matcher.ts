import { MessageDescriptor } from "@selfage/message/descriptor";
import { eqMessage } from "@selfage/message/test_matcher";
import { NodeRemoteCallDescriptor } from "@selfage/service_descriptor";
import { MatchFn, assert, assertThat, eq } from "@selfage/test_matcher";

export function eqService(expected: NodeRemoteCallDescriptor): MatchFn<any> {
  return (actualRequest) => {
    assertThat(actualRequest.descriptor, eq(expected), "service descriptor");
  };
}

export function eqRequestMessageBody<T>(
  expectedBody: T,
  messageDescriptor: MessageDescriptor<T>,
): MatchFn<any> {
  return (actualRequest) => {
    assert(
      Boolean(
        (actualRequest.descriptor as NodeRemoteCallDescriptor).body.messageType,
      ),
      "request body to be of message type",
      "not",
    );
    assertThat(
      actualRequest.body,
      eqMessage(expectedBody, messageDescriptor),
      "request body",
    );
  };
}

export function eqRequestMetadata<T>(
  expectedValue: T,
  messageDescriptor: MessageDescriptor<T>,
): MatchFn<any> {
  return (actualRequest) => {
    assert(
      Boolean(
        (actualRequest.descriptor as NodeRemoteCallDescriptor).metadata.type,
      ),
      "request metadata to exist",
      "not",
    );
    assertThat(
      actualRequest.metadata,
      eqMessage(expectedValue, messageDescriptor),
      "request metadata",
    );
  };
}
