# UniThrift 🎓

A full-stack **campus thrift marketplace** for students to buy, sell and rent textbooks, calculators, lab coats, study notes and academic accessories — with orders, payments, rentals, messaging, reviews, reports and an admin panel.

## Features

- **Auth** — student register/login (scrypt-hashed passwords, HMAC-signed httpOnly session cookie)
- **Marketplace** — browse, search, category/department filters, budget range slider, sort (newest / price / popular)
- **Listings** — post items for **sale**, **rent**, or **both** (only registered students can list; listings go live only after admin approval)
- **Orders & payments** — buy outright with Campus UPI or cash at meetup; sold items can't be repurchased
- **Rentals** — per-day pricing + refundable deposit; overlapping date requests are rejected
- **Wishlist, messages, reviews (1–5★), reports**
- **Admin panel** — approve/reject listings, block users, resolve reports, manage categories, dashboard stats
- **Business rules** — no buying/renting your own listing, non-negative prices, unique student IDs / emails

## Tech stack

- **Backend:** Node.js ≥ 24, zero npm dependencies — uses the built-in `node:sqlite` module
- **Database:** SQLite (schema in `database/schema.sql`)
- **Frontend:** Exported HTML/CSS frames (Tailwind via CDN) wired to the backend with vanilla JS

## Getting started

```bash
# requires Node.js 24+ (node:sqlite)
node server.js
```

Then open **http://localhost:3000**.

### Demo accounts

| Role    | Email              | Password    |
|---------|--------------------|-------------|
| Admin   | admin@campus.edu   | Admin@123   |
| Student | ananya@campus.edu  | Student@123 |

(The database self-seeds on first run. Demo student passwords are all `Student@123`.)

## Project structure

```
server.js              # HTTP server + JSON API + static serving
lib/auth.js            # scrypt hashing + HMAC session cookie
lib/db.js              # DB bootstrap: opens DB, applies schema, seeds demo data
database/schema.sql    # all DDL (14 tables, 6 indexes)
database/README.md     # DB notes (reseed instructions)
public/                # exported frames + page scripts + assets
```

## Database

- The live database file is **not** committed (regenerate it by deleting `database/unithrift.sqlite` and restarting the server).
- Override the DB path with the `CT_DB` environment variable.

## License

For educational use.