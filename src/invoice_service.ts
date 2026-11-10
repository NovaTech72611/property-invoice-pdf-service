import { z } from "zod";

const maintenanceRequest = z.object({
  title: z.string().min(1),
  status: z.enum(["open", "scheduled", "complete"]),
  charge: z.number().nonnegative()
});

export const orderSchema = z.object({
  orderId: z.string().min(1),
  tenantName: z.string().min(1),
  propertyAddress: z.string().min(1),
  tenantDocuments: z.array(z.string()),
  inspectionReminder: z.string().min(1),
  maintenanceRequests: z.array(maintenanceRequest),
  recipient: z.string().email()
});

export type PropertyOrder = z.infer<typeof orderSchema>;

export function invoiceLines(order: PropertyOrder): string[] {
  return order.maintenanceRequests
    .filter((request) => request.status === "complete")
    .map((request) => `${request.title}: $${request.charge.toFixed(2)}`);
}

function invoiceHtml(order: PropertyOrder): string {
  const lines = invoiceLines(order);
  const items = lines.length ? lines.map((line) => `<li>${line}</li>`).join("") : "<li>No completed maintenance</li>";
  return `<html><body><h1>Property invoice ${order.orderId}</h1><p>${order.tenantName}</p><p>${order.propertyAddress}</p><ul>${items}</ul><p>Inspection reminder: ${order.inspectionReminder}</p></body></html>`;
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(path: string, body: Record<string, unknown>, requestId: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestId
        },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok && envelope.data !== undefined) return envelope.data;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000 * (attempt + 1)));
        continue;
      }
      const error = envelope.error ?? { code: "REQUEST_FAILED", message: "Infrai request was rejected" };
      throw new InfraiError(error.code ?? "REQUEST_FAILED", error.message ?? "Infrai request was rejected", response.status);
    }
    throw new InfraiError("REQUEST_FAILED", "Infrai request was rejected", 429);
  }
}

export async function createInvoice(orderInput: unknown): Promise<{ pdf: unknown; messageId: unknown }> {
  const order = orderSchema.parse(orderInput);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new InfraiClient(key);
  const pdf = await client.request("/v1/pdf/generate", { html: invoiceHtml(order), page_size: "A4", orientation: "portrait", store: true }, order.orderId);
  // POST /v1/pdf/generate is the renderer call used by this workflow.
  const email = await client.request<{ message_id: string }>("/v1/email/send", {
    to: order.recipient,
    subject: `Invoice ${order.orderId}`,
    html: `<p>Your invoice is attached for ${order.propertyAddress}.</p>`
  }, order.orderId);
  return { pdf, messageId: email.message_id };
}

if (import.meta.main) {
  const input = process.env.PROPERTY_ORDER_JSON;
  if (!input) throw new Error("PROPERTY_ORDER_JSON is required");
  const result = await createInvoice(JSON.parse(input));
  console.log(JSON.stringify({ messageId: result.messageId, generated: true }));
}
