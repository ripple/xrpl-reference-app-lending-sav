import { Client } from "xrpl";
import { XRPL_NETWORK_URL } from "@/lib/constants";

let clientInstance: Client | null = null;
let connectionPromise: Promise<Client> | null = null;

export async function getXrplClient(): Promise<Client> {
  if (clientInstance?.isConnected()) return clientInstance;

  if (!connectionPromise) {
    connectionPromise = (async () => {
      const client = new Client(XRPL_NETWORK_URL);
      await client.connect();
      clientInstance = client;
      connectionPromise = null;
      return client;
    })();
  }

  return connectionPromise;
}

export async function disconnectXrplClient(): Promise<void> {
  if (clientInstance?.isConnected()) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}
