# API Documentation

## Authentication

### POST /api/auth/register
Creates a new user.
Body:
- name
- email
- password
- role (`customer`, `agent`, `admin`)
- phone

### POST /api/auth/login
Authenticates user and returns JWT.
Body:
- email
- password

## Zones and Areas

### GET /api/zones
Admin-only. Returns all zones.

### POST /api/zones
Admin-only. Creates a new zone.
Body:
- name

### POST /api/areas
Admin-only. Creates a new area.
Body:
- name
- zoneId

### GET /api/areas
Returns all areas with zone names.

## Rate Cards and COD Surcharges

### POST /api/rate-cards
Admin-only. Creates a rate card.
Body:
- fromZone
- toZone
- orderType (`B2B` or `B2C`)
- ratePerKg

### GET /api/rate-cards
Admin-only. Returns configured rate cards.

### POST /api/cod-surcharge
Admin-only. Sets COD surcharge per order type.
Body:
- orderType
- surcharge

## Agents

### POST /api/agents
Admin-only. Adds an agent profile.
Body:
- userId
- zoneId

### GET /api/agents
Admin-only. Returns agent list.

## Orders

### POST /api/orders/calculate
Returns delivery charge estimate without creating an order.
Body:
- pickupAreaId
- dropAreaId
- length
- width
- height
- actualWeight
- orderType
- paymentType

### POST /api/orders
Creates a new order.
Body:
- pickupAreaId
- dropAreaId
- length
- width
- height
- actualWeight
- orderType
- paymentType
- customerId (optional for admin-created orders)

### GET /api/orders
Returns orders for the current user.
Admin can filter by query params:
- status
- agentId
- pickupZone
- dropZone

### POST /api/orders/:id/assign
Admin-only. Assigns an order to an agent.
Body:
- agentId (optional)

### PATCH /api/orders/:id/status
Agent or admin updates order status.
Body:
- status
- notes

### POST /api/orders/:id/reschedule
Customer-only. Reschedules a failed delivery.
Body:
- rescheduleDate

### GET /api/orders/:id/history
Returns immutable status history for an order.

## Admin Summary

### GET /api/admin/summary
Admin-only. Returns total orders and counts by status.
