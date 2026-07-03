# System Design

## Rate Calculation Engine
The backend uses a configurable engine in `server/src/rateEngine.js`.
- Volumetric weight is calculated as `L × B × H / 5000`.
- Billed weight is the maximum of actual weight and volumetric weight.
- The system detects pickup and drop zones via area records linked to zones.
- The correct `rate_card` row is looked up by pickup zone, drop zone, and order type (`B2B` or `B2C`).
- COD surcharge is stored in `cod_surcharges` and applied only when payment type is `COD`.
- Final charge = billed weight × rate + COD surcharge.

## Zone Detection Approach
Zones are managed by admin and associated with areas.
- `zones` holds zone names.
- `areas` holds area names and links to a zone.
- Pickup and drop address selection resolves to an area ID and therefore a zone.
- This keeps the zone detection flexible and admin-configurable.

## Auto-assignment Logic
Agent assignment uses an availability model.
- Agents have `status` and `zone_id`.
- When an order is created, the server tries to assign the nearest available agent in the pickup zone.
- If an available agent is found, their status becomes `busy` and the order status becomes `Assigned`.
- If no agent is available, the order stays `Pending` until manual or later automatic assignment.

## Order Status Lifecycle
The platform tracks immutable history in `order_history`.
- Each order event is stored with `order_id`, `status`, `actor_id`, `actor_role`, `notes`, and `created_at`.
- Statuses include: `Created`, `Assigned`, `Picked Up`, `In Transit`, `Out for Delivery`, `Delivered`, `Failed`, and rescheduled states.
- Customers and admins can view the full timeline via API.

## Failed Delivery Handling
Failed deliveries are recorded as a status update.
- When an agent marks an order as `Failed`, the order history logs it and a customer notification is sent.
- The customer can reschedule using the `/orders/:id/reschedule` endpoint.
- When rescheduled, the system attempts to reassign the nearest available agent and updates the order status accordingly.
- The new attempt is captured with the reschedule date and a fresh history record.
