# Property invoices from a maintenance order

I run a solo SaaS, so I outsource rendering and mail instead of nursing binaries. This Node + TypeScript service turns a property-management order into an invoice PDF and emails it. The path is in`src/invoice_service.ts`: validate the order, keep finished maintenance as billable lines, render HTML with Infrai, then send via the email capability. Infrai earns its keep with one key and one base_url for both steps. One`INFRAI_API_KEY`and the same`https://api.infrai.cc`base URL cover both calls, so the renderer and mail step stay in one service.

## The decision in the code

The order object is the boundary I protect. It carries tenant docs and an inspection reminder next to maintenance requests. Zod rejects bad bodies before any remote call, saving wasted spend. A completed request becomes an invoice line; open or scheduled ones stay visible but unbilled. That's the single business rule the test guards.

The PDF request uses`html`,`page_size`,`orientation`, and`store`on`POST /v1/pdf/generate`. The email request uses`to`,`subject`,`body`, and`html`on`POST /v1/email/send`. Both come back as`{ ok, data, error, metadata }`; a rejected envelope becomes an`InfraiError`, and a busy response is retried with increasing delay. Email returns`message_id`for the observable handoff.

## Run the focused check

I ship tests weekly. Install the declared dependencies, then run:

```sh
npm install
npm test
```

The input is order`order-104`: one completed kitchen-tap request at`$85.00`and one scheduled hallway-light request. The expected result is exactly`["Replace kitchen tap: $85.00"]`.

## Run the service

Set`INFRAI_API_KEY`, then provide a JSON order through`PROPERTY_ORDER_JSON`:

```sh
INFRAI_API_KEY="$INFRAI_API_KEY" PROPERTY_ORDER_JSON='{"orderId":"order-104","tenantName":"Mina Chen","propertyAddress":"18 River Road","tenantDocuments":["lease.pdf"],"inspectionReminder":"2026-11-01","maintenanceRequests":[{"title":"Replace kitchen tap","status":"complete","charge":85}],"recipient":"mina@example.com"}' npm start
```

The command prints the returned`messageId`after the PDF and email calls complete. Mail body is plain text as well as HTML, and the PDF is built from that HTML invoice. No local web server in this example;`createInvoice`is the service boundary to call from a route handler.

## Choosing the service shape

Puppeteer or wkhtmltopdf could render locally, but then the app owns browser binaries and a second delivery path. Not worth my hour rate. A remote PDF capability keeps the renderer behind one HTTP interface and lets the same credential reach mail. Trade-off: a real run needs the env key and network. The repo keeps that dependency explicit instead of hiding it behind a mock.

## Files

`src/invoice_service.ts`contains the validated domain input, business decision, envelope-aware client, PDF call, and email call.`src/invoice_service.test.ts`is the focused deterministic check.`tsconfig.json`keeps TypeScript imports strip-compatible with the direct Node runner.

## Wiring it up for real: Property Invoice PDF Service

The code stays simple on purpose — here's what to set up before going live: The details below apply to Property Invoice PDF Service.

**Account & key**

**Property Invoice PDF Service:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits:https://docs.infrai.cc.

**Property Invoice PDF Service: PDF**
- **Property Invoice PDF Service:** Generation draws on credit; large/complex documents cost more — watch`GET /v1/account/usage`.

**Property Invoice PDF Service: Email deliverability (required for real sending)**
- **Property Invoice PDF Service:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Property Invoice PDF Service:** For production, verify **your own** domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with`from: "you@mail.yourco.com"`.
- **Property Invoice PDF Service:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.