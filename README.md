# Last-Mile Delivery Tracker

A delivery management platform for customers, admins, and delivery agents. It supports zone-based rate calculation, auto agent assignment, order tracking, failed delivery handling, and notifications.

## Features
- Role-based auth for customers, admins, and agents
- Admin zone and rate card management
- Auto-calculated delivery charge using volumetric weight and B2B/B2C pricing
- COD surcharges and status-aware tracking
- Auto assignment to nearest available agent
- Immutable order history timeline
- Email notifications on status changes
 - Manual and auto agent assignment
 - Admin order filtering by status, pickup zone, drop zone, and agent

## Project Structure
- `server/` - Express backend, SQLite database, API endpoints
- `client/` - React frontend with user flows for login, order creation, tracking, and admin management

## Setup
1. Install dependencies
   - `cd server && npm install`
   - `cd client && npm install`
2. Copy `.env.example` to `.env` inside each folder and update values.
3. Seed sample data:
   - `cd server && npm run seed`
4. Run the server:
   - `cd server && npm run dev`
5. Run the client:
   - `cd client && npm run dev`

## Sample credentials
- Admin: `admin@example.com` / `admin123`
- Agent: `agent1@example.com` / `agent123`
- Customer: `customer@example.com` / `customer123`

## Notes
- The backend stores data in `server/database.sqlite`.
- Email notifications use SMTP credentials from `.env`.
- You can use Ethereal Mail for development if you do not have a real SMTP account.

## Documentation
- `server/docs/api-docs.md` - API reference for authentication, orders, zones, agents, and admin endpoints
- `server/docs/db-schema.md` - Database table definitions and relationships

## Unique Enhancements
To make this project stand out, consider:
- adding map-based agent tracking with live location updates
- building a dynamic zone editor with polygons instead of named areas
- integrating SMS notifications using Twilio or a free SMS API
- adding customer reviews and proof-of-delivery photo uploads
- implementing analytics dashboards for delivery performance

## System Design
See `server/docs/system-design.md` for rate calculation, zone detection, auto-assignment, and failed delivery handling details.
