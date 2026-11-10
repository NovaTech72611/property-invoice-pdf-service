import assert from "node:assert/strict";
import { invoiceLines, orderSchema } from "./invoice_service.ts";

const order = orderSchema.parse({
  orderId: "order-104",
  tenantName: "Mina Chen",
  propertyAddress: "18 River Road",
  tenantDocuments: ["lease.pdf"],
  inspectionReminder: "2026-11-01",
  maintenanceRequests: [
    { title: "Replace kitchen tap", status: "complete", charge: 85 },
    { title: "Check hallway light", status: "scheduled", charge: 30 }
  ],
  recipient: "mina@example.com"
});

assert.deepEqual(invoiceLines(order), ["Replace kitchen tap: $85.00"]);
console.log("invoice decision test passed");
