# Database Schema

## users
- id
- name
- email
- password
- role (`customer`, `agent`, `admin`)
- phone
- created_at

## zones
- id
- name

## areas
- id
- name
- zone_id -> zones.id

## rate_cards
- id
- from_zone -> zones.id
- to_zone -> zones.id
- order_type (`B2B` or `B2C`)
- rate_per_kg
- is_intra

## cod_surcharges
- id
- order_type
- surcharge

## agents
- id
- user_id -> users.id
- zone_id -> zones.id
- status (`available`, `busy`)
- current_lat
- current_lng
- updated_at

## orders
- id
- customer_id -> users.id
- admin_id -> users.id
- agent_id -> agents.id
- pickup_area_id -> areas.id
- drop_area_id -> areas.id
- length
- width
- height
- actual_weight
- volumetric_weight
- billed_weight
- order_type
- payment_type
- status
- charge
- cod_surcharge
- reschedule_date
- created_at
- updated_at

## order_history
- id
- order_id -> orders.id
- status
- actor_id
- actor_role
- notes
- created_at
