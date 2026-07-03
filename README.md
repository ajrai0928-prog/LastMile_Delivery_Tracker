# Last-Mile Delivery Tracker

A delivery management platform for customers, admins, and delivery agents. It supports zone-based rate calculation, auto agent assignment, order tracking, failed delivery handling, and notifications.

## Live Demo
- **Frontend (Vercel):** https://lastmile-delivery-tracker-swart.vercel.app
- **Backend API (Render):** https://lastmile-delivery-tracker-t32h.onrender.com

> Note: the backend is hosted on Render's free tier, which spins down after periods of inactivity. The first request after idle time may take 30–50 seconds to respond while the server wakes up.

## Features
- Role-based auth for customers, admins, and agents
- Admin zone and rate card management
- Auto-calculated delivery charge using volumetric weight and B2B/B2C pricing
- COD surcharges and status-aware tracking
- Auto assignment to nearest available agent
- Immutable order history timeline
- Email and SMS notifications on status changes
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
- The backend stores data in `server/database.sqlite`. On Render's free tier the filesystem is ephemeral, so this file resets on redeploy/restart.
- Email and SMS notifications are sent via [Brevo](https://www.brevo.com) (formerly Sendinblue), using `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, and `BREVO_SMS_SENDER` from `.env`.
- Brevo's free tier includes daily email and SMS credits, sufficient for development and demo use.

## Documentation
- `server/docs/api-docs.md` - API reference for authentication, orders, zones, agents, and admin endpoints
- `server/docs/db-schema.md` - Database table definitions and relationships

## Unique Enhancements
To make this project stand out, consider:
- adding map-based agent tracking with live location updates
- building a dynamic zone editor with polygons instead of named areas
- adding customer reviews and proof-of-delivery photo uploads
- implementing analytics dashboards for delivery performance
- migrating from SQLite to PostgreSQL for persistent storage in production

## System Design
See `server/docs/system-design.md` for rate calculation, zone detection, auto-assignment, and failed delivery handling details.