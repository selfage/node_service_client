import { ServiceDescriptor } from "@selfage/service_descriptor";
import { ClientType } from "@selfage/service_descriptor/client_type";

export let NODE_SERVICE: ServiceDescriptor = {
  name: "NodeService",
  clientType: ClientType.NODE,
  protocol: "http",
  port: 8080,
}
