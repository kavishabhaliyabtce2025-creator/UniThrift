-- ============================================================================
-- UniThrift – Database Schema
-- ----------------------------------------------------------------------------
-- This file contains ALL DDL (tables + indexes) for the marketplace.
-- It is applied automatically by lib/db.js on every server start
-- (idempotent: CREATE TABLE IF NOT EXISTS => safe to re-run).
-- Seeding is NOT here – seed data contains runtime-scrypt password hashes,
-- so it stays in JS (lib/db.js).
-- ----------------------------------------------------------------------------
-- To start fresh: stop the server, delete database/unithrift.sqlite
-- (and its -wal/-shm companions), then start the server again.
-- ============================================================================

-- ---------------------------------------------------------------- users ----
-- Registered student / admin accounts. student_id & email must be unique.
CREATE TABLE IF NOT EXISTS users (
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT NOT NULL,
  department    TEXT NOT NULL,
  year          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT','ADMIN')),
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','BLOCKED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------- categories ----
CREATE TABLE IF NOT EXISTS categories (
  category_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL UNIQUE,
  description   TEXT
);

-- ------------------------------------------------------------- products ----
CREATE TABLE IF NOT EXISTS products (
  product_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL REFERENCES categories(category_id),
  product_name  TEXT NOT NULL,
  description   TEXT NOT NULL,
  brand         TEXT,
  author        TEXT,
  edition       TEXT,
  condition     TEXT NOT NULL
);

-- ------------------------------------------------------------- listings ----
-- A listing references a product + the selling student. listing_type is
-- SALE / RENT / BOTH; sale_price & rent_price are NULL when not offered.
CREATE TABLE IF NOT EXISTS listings (
  listing_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL REFERENCES products(product_id),
  seller_id    INTEGER NOT NULL REFERENCES users(user_id),
  listing_type TEXT NOT NULL DEFAULT 'SALE' CHECK (listing_type IN ('SALE','RENT','BOTH')),
  sale_price   REAL,
  rent_price   REAL,
  deposit      REAL NOT NULL DEFAULT 0,
  location     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','AVAILABLE','RESERVED','RENTED','SOLD','REJECTED','REMOVED')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------- product_images ----
CREATE TABLE IF NOT EXISTS product_images (
  image_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------- orders ----
CREATE TABLE IF NOT EXISTS orders (
  order_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id   INTEGER NOT NULL REFERENCES users(user_id),
  listing_id INTEGER NOT NULL REFERENCES listings(listing_id),
  order_date TEXT NOT NULL DEFAULT (datetime('now')),
  amount     REAL NOT NULL,
  status     TEXT NOT NULL DEFAULT 'PENDING'
             CHECK (status IN ('PENDING','ACCEPTED','REJECTED','COMPLETED','CANCELLED')),
  note       TEXT
);

-- -------------------------------------------------------------- rentals ----
-- start_date / return_date drive the no-overlap rule in the API.
CREATE TABLE IF NOT EXISTS rentals (
  rental_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id    INTEGER NOT NULL REFERENCES listings(listing_id),
  renter_id     INTEGER NOT NULL REFERENCES users(user_id),
  start_date    TEXT NOT NULL,
  return_date   TEXT NOT NULL,
  price_per_day REAL NOT NULL,
  deposit       REAL NOT NULL DEFAULT 0,
  total_amount  REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','APPROVED','ACTIVE','RETURNED','CANCELLED','REJECTED','OVERDUE')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------- payments ----
CREATE TABLE IF NOT EXISTS payments (
  payment_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders(order_id),
  amount         REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash on Campus'
                 CHECK (payment_method IN ('Cash on Campus','Campus UPI','Online')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','COMPLETED','REFUNDED')),
  payment_date   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------- messages ----
CREATE TABLE IF NOT EXISTS messages (
  message_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id   INTEGER NOT NULL REFERENCES users(user_id),
  receiver_id INTEGER NOT NULL REFERENCES users(user_id),
  listing_id  INTEGER REFERENCES listings(listing_id),
  message     TEXT NOT NULL,
  sent_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------- wishlist ----
CREATE TABLE IF NOT EXISTS wishlist (
  wishlist_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(user_id),
  listing_id  INTEGER NOT NULL REFERENCES listings(listing_id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, listing_id)
);

-- -------------------------------------------------------------- reviews ----
-- rating is 1..5 per the PRD business rule.
CREATE TABLE IF NOT EXISTS reviews (
  review_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(order_id),
  reviewer_id INTEGER NOT NULL REFERENCES users(user_id),
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------- reports ----
CREATE TABLE IF NOT EXISTS reports (
  report_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL REFERENCES listings(listing_id),
  reported_by INTEGER NOT NULL REFERENCES users(user_id),
  reason      TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','DISMISSED')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------------- indexes ----
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_listing ON orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_rentals_listing ON rentals(listing_id);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, receiver_id);