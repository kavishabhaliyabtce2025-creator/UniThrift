'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { hashPassword } = require('./auth');

// ----------------------------------------------------------------------
// Database bootstrap
// ----------------------------------------------------------------------
// The SQLite file and the full schema live together in the dedicated
// `database/` folder (see database/schema.sql and database/README.md).
// Override with CT_DB to point at a database anywhere else.
const DB_DIR = path.join(__dirname, '..', 'database');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = process.env.CT_DB || path.join(DB_DIR, 'unithrift.sqlite');
const SCHEMA_FILE = path.join(DB_DIR, 'schema.sql');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// All DDL lives in database/schema.sql (plain SQL, idempotent).
db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));

// ---------------------------------------------------------------- seeding
const seeded =
  db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0 &&
  db.prepare("SELECT COUNT(*) AS n FROM listings").get().n > 0;

if (!seeded) {
  const ins = {
    user: db.prepare(`INSERT INTO users (student_id,name,email,phone,department,year,password_hash,role,status)
                      VALUES (?,?,?,?,?,?,?,?,?)`),
    cat: db.prepare('INSERT INTO categories (category_name, description) VALUES (?,?)'),
    prod: db.prepare(`INSERT INTO products (category_id, product_name, description, brand, author, edition, condition)
                      VALUES (?,?,?,?,?,?,?)`),
    list: db.prepare(`INSERT INTO listings (product_id, seller_id, listing_type, sale_price, rent_price, deposit, location, status)
                      VALUES (?,?,?,?,?,?,?,?)`),
    img: db.prepare('INSERT INTO product_images (listing_id, image_url, sort_order) VALUES (?,?,?)'),
    order: db.prepare(`INSERT INTO orders (buyer_id, listing_id, order_date, amount, status) VALUES (?,?,?,?,?)`),
    pay: db.prepare(`INSERT INTO payments (order_id, amount, payment_method, payment_status, payment_date) VALUES (?,?,?,?,?)`),
    rent: db.prepare(`INSERT INTO rentals (listing_id, renter_id, start_date, return_date, price_per_day, deposit, total_amount, status, created_at)
                      VALUES (?,?,?,?,?,?,?,?,?)`),
    msg: db.prepare('INSERT INTO messages (sender_id, receiver_id, listing_id, message, sent_at) VALUES (?,?,?,?,?)'),
    wish: db.prepare('INSERT INTO wishlist (user_id, listing_id) VALUES (?,?)'),
    rev: db.prepare('INSERT INTO reviews (order_id, reviewer_id, rating, comment, created_at) VALUES (?,?,?,?,?)'),
    rep: db.prepare('INSERT INTO reports (listing_id, reported_by, reason, description) VALUES (?,?,?,?)'),
  };

  const U = (student_id, name, email, phone, dept, year) => {
    ins.user.run(student_id, name, email, phone, dept, year, hashPassword('Student@123'), 'STUDENT', 'ACTIVE');
    return db.prepare('SELECT user_id FROM users WHERE email = ?').get(email).user_id;
  };

  ins.user.run('ADMIN001', 'Rohit Kulkarni', 'admin@campus.edu', '9880000001', 'Admin', '-',
    hashPassword('Admin@123'), 'ADMIN', 'ACTIVE');
  const adminId = db.prepare('SELECT user_id FROM users WHERE email = ?').get('admin@campus.edu').user_id;

  const ananya = U('CSE2023001', 'Ananya R.', 'ananya@campus.edu', '9880000002', 'CSE', '3rd');
  const sameer = U('ECE2023002', 'Sameer K.', 'sameer@campus.edu', '9880000003', 'ECE', '2nd');
  const priya  = U('MECH2024001', 'Priya M.', 'priya@campus.edu', '9880000004', 'MECH', '1st');
  const rahul  = U('CE2021005', 'Rahul V.', 'rahul@campus.edu', '9880000005', 'CIVIL', '4th');
  const neha   = U('MATH2023003', 'Neha S.', 'neha@campus.edu', '9880000006', 'MATH', '2nd');

  const C = (name, desc) => {
    ins.cat.run(name, desc);
    return db.prepare('SELECT category_id FROM categories WHERE category_name = ?').get(name).category_id;
  };
  const textbooks = C('Textbooks', 'Course textbooks and reference reading');
  const reference  = C('Reference Books', 'Coding, competitive and general reference books');
  const labmanuals = C('Lab Manuals', 'Printed lab manuals and experiment guides');
  const calculators = C('Calculators', 'Scientific and engineering calculators');
  const labcoats   = C('Lab Coats', 'Lab coats and safety wear');
  const studynotes = C('Study Notes', 'Handwritten and printed study notes');
  const accessories = C('Academic Accessories', 'Drawing kits, geometry boxes and accessories');

  const IMG = {
    dbms: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTsAdsIdABTt34zNaPeJq3N90y8oSl2sQEGEnXXMoBecHfpJacNTGVNNYAKa97juNvcZ7kvj2fxCOUz5rbTitAu9RiwFhw5vDEG2MACvW-zEkOLTll6q2cWkQYRQr8DvHuCbE0VwzCO2sXmvqBzVaMur42IxhPmqa6AdlReWcW8K_r7EPgQs3mf5pWHRCrTN1T3LEBAQ0ccp5qX73q3ek7q7fprh_bAR88yfyTjHzwpLysLJ2CnGfsSA',
    clrs: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDzh1r5YMB_iOVbsgOslrl2y7aXYcX7Q9GyoRCgEyawQXybe-LHdUsXxhuLj_qWPPIeRHn1I9g2Pp1-8X-dTJdOLHUiil9RXvr9htMbPt1GfMuxQFlUoZpqsV5QCycEhktaRoZs78cLg8FV3iBxUkNeYmmiHYCmr2c_so6r2OelwszFLNbLVeuF0H0GmA78NKk1QOtz3-bLHq-JCNbl1g1QxDzyCcORkPNtV-NUW1EbSzlBfVW7tGF6ew',
    calc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPT8MggvUMvSEj5mWpC1iv8eK2m1DmTOOtbOs_T7Zx0bX7rXJktmAFLUAIgPtYN_gLw_rHQhQxC63oio8BpTmxkB3vr0tfn7RSEF1vWPsW68fxDRXwK4N-ikzKUYesiwVtvHKDmsdbaHXJQCpuMJr8H0UFENgT08JsaeSyQFoj9DhjwzmUBVW2TFjzyN5cmexRqpcNryXPaT3AozyUZX8vmNaeZUZ4CDZT2PfFGwhE9PQPnWtdVDJgbA',
    'p1': 'https://picsum.photos/seed/ct-thermo/600/450',
    'p2': 'https://picsum.photos/seed/ct-chem/600/450',
    'p3': 'https://picsum.photos/seed/ct-labcoat/600/450',
    'p4': 'https://picsum.photos/seed/ct-labman/600/450',
    'p5': 'https://picsum.photos/seed/ct-calculus/600/450',
    'p6': 'https://picsum.photos/seed/ct-notes/600/450',
    'p7': 'https://picsum.photos/seed/ct-fx82/600/450',
    'p8': 'https://picsum.photos/seed/ct-kit/600/450',
    'p9': 'https://picsum.photos/seed/ct-mech/600/450',
  };

  const rows = [
    // product_name, cat, desc, brand, author, edition, condition, seller, type, sale, rent, deposit, location, status, img
    ['Database System Concepts (7th Ed.)', textbooks, 'Classic undergraduate DBMS textbook with normalization, transactions and SQL chapters. Slight margin notes from previous sem.', 'McGraw Hill', 'Silberschatz / Korth / Sudarshan', '7th', 'Very Good', ananya, 'SALE', 850.0, null, 0, 'Library Desk 2 (Atrium)', 'AVAILABLE', IMG.dbms],
    ['Introduction to Algorithms (4th Ed.)', textbooks, 'The CLRS bible for DSA. Mint condition, unmarked, originally £60.', 'MIT Press', 'Cormen / Leiserson / Rivest / Stein', '4th', 'Like New', sameer, 'SALE', 1500.0, null, 0, 'Student Union Hub 1', 'AVAILABLE', IMG.clrs],
    ['Casio fx-991CW Scientific Calculator', calculators, 'Approved for all CSE/ECE exams. Includes slide-on hard case.', 'Casio', null, '3rd', 'Good', priya, 'BOTH', 1200.0, 40, 300, 'Central Library Lawn', 'AVAILABLE', IMG.calc],
    ['TI-36X Pro Scientific Calculator', calculators, 'Solar powered multi-line display. Perfect for engineering paper 1.', 'Texas Instruments', null, '2nd', 'Good', priya, 'BOTH', 1200.0, 35, 250, 'Central Library Lawn', 'AVAILABLE', IMG.calc],
    ['Engineering Thermodynamics (ME 201)', textbooks, 'Cengel 9th edition with practice problem sets solved in pencil.', 'Pearson', 'Cengel / Boles', '9th', 'Acceptable', rahul, 'RENT', null, 60, 800, 'Mechanical Block, Room 204', 'RENTED', IMG.p1],
    ['Organic Chemistry (CHEM 210)', textbooks, 'Clayden full colour. Some highlight on carbonyl chapter only.', 'Wiley', 'Clayden / Greeves / Warren', '2nd', 'Very Good', neha, 'BOTH', 1600.0, 90, 900, 'Chem Lab Store', 'AVAILABLE', IMG.p2],
    ['White Lab Coat (Size M)', labcoats, 'Freshly laundered polyester-cotton lab coat with pocket.', 'SterilePro', null, null, 'New', rahul, 'BOTH', 450.0, 25, 150, 'Bio Lab Reception', 'RESERVED', IMG.p3],
    ['Digital Logic Design Lab Manual', labmanuals, 'EE department printed manual with all 12 experiments + viva questions.', 'CSU EE Dept', 'EE Faculty', '1st', 'Good', sameer, 'SALE', 250.0, null, 0, 'EE Workshop', 'AVAILABLE', IMG.p4],
    ['Calculus Early Transcendentals (8th Ed.)', textbooks, 'Stewart. Very good condition, solutions manual included as PDF.', 'Cengage', 'James Stewart', '8th', 'Very Good', ananya, 'SALE', 1200.0, null, 0, 'Library Desk 2 (Atrium)', 'SOLD', IMG.p5],
    ['Physics Fundamentals Notes (PHY101)', studynotes, 'Handwritten exam revision bundle covering all 6 units.', null, null, null, 'Good', neha, 'SALE', 150.0, null, 0, 'Hostel C Common Room', 'AVAILABLE', IMG.p6],
    ['Casio fx-82MS (Classic)', calculators, 'Vintage reliable workhorse. Fresh set of batteries installed.', 'Casio', null, null, 'Acceptable', rahul, 'RENT', null, 20, 150, 'Mechanical Block, Room 204', 'AVAILABLE', IMG.p7],
    ['Data Structures Notes (CS201)', studynotes, 'Printed, neatly organised programming notes with example code.', 'CSU CSE Dept', 'CSE Faculty', '2026', 'Like New', priya, 'SALE', 180.0, null, 0, 'CSE Block, Floor 3', 'PENDING', IMG.p8],
    ['Civil Engineering Drawing Kit', accessories, 'Full kit: compass, drafting set, scale, French curves.', null, null, null, 'Good', sameer, 'SALE', 900.0, null, 0, 'Civil Block Store', 'SOLD', IMG.p9],
    ['Engineering Mechanics (ME 105)', textbooks, 'Hibbeler 14th ed. Corner wear on cover, pages clean.', 'Pearson', 'Hibbeler', '14th', 'Acceptable', ananya, 'SALE', 750.0, null, 0, 'Library Desk 2 (Atrium)', 'PENDING', IMG.p1],
  ];

  let listingCounter = {};
  for (const r of rows) {
    const [pname, catId, desc, brand, author, edition, condition, seller, type, sale, rent, dep, loc, status, img] = r;
    ins.prod.run(catId, pname, desc, brand, author, edition, condition);
    const pid = db.prepare('SELECT product_id FROM products WHERE product_name = ?').get(pname).product_id;
    ins.list.run(pid, seller, type, sale, rent, dep, loc, status);
    const lid = db.prepare('SELECT last_insert_rowid() AS id').get().id;
    ins.img.run(lid, img, 0);
    listingCounter[lid] = 1;
    if (status === 'AVAILABLE') listingCounter[lid] = 0; // for popular sort
  }

  // orders / payments / rentals / messages / wishlist / reviews / reports
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

  // Completed past sale: Priya bought Calculus (listing 9)
  const o1 = (ins.order.run(priya, 9, addDays(-20), 1200.0, 'COMPLETED'), db.prepare('SELECT last_insert_rowid() AS id').get().id);
  ins.pay.run(o1, 1200.0, 'Campus UPI', 'COMPLETED', addDays(-19));
  ins.rev.run(o1, priya, 5, 'Great condition, smooth handover at the library desk.', addDays(-18));

  // Completed past sale: Rahul bought Civil kit (listing 13)
  const o2 = (ins.order.run(rahul, 13, addDays(-12), 900.0, 'COMPLETED'), db.prepare('SELECT last_insert_rowid() AS id').get().id);
  ins.pay.run(o2, 900.0, 'Cash on Campus', 'COMPLETED', addDays(-11));
  ins.rev.run(o2, rahul, 4, 'Good kit, seller slightly late but everything worked.', addDays(-10));

  // Accepted sale (reserved): Sameer buying lab coat from Rahul (listing 7)
  const o3 = (ins.order.run(sameer, 7, addDays(-2), 450.0, 'ACCEPTED'), db.prepare('SELECT last_insert_rowid() AS id').get().id);
  ins.pay.run(o3, 450.0, 'Campus UPI', 'COMPLETED', addDays(-1));

  // Pending buy: Neha wants DBMS book from Ananya (listing 1)
  const o4 = (ins.order.run(neha, 1, addDays(-1), 850.0, 'PENDING'), db.prepare('SELECT last_insert_rowid() AS id').get().id);
  ins.pay.run(o4, 850.0, 'Cash on Campus', 'PENDING', addDays(-1));

  // Pending buy: Ananya wants ALGO book from Sameer (listing 2)
  ins.order.run(ananya, 2, addDays(0), 1500.0, 'PENDING');
  const o5 = db.prepare('SELECT last_insert_rowid() AS id').get().id;
  ins.pay.run(o5, 1500.0, 'Campus UPI', 'PENDING', addDays(0));

  // Rentals
  // Completed rental of fx-82MS (listing 11) by Priya
  ins.rent.run(11, priya, addDays(-30), addDays(-3), 20, 150, 540, 'RETURNED', addDays(-30));
  // Active rental of Thermo (listing 5) by Neha
  ins.rent.run(5, neha, addDays(-3), addDays(25), 60, 800, 1680, 'ACTIVE', addDays(-10));
  // Pending rental request: Rahul -> Casio fx-991CW (listing 3)
  ins.rent.run(3, rahul, addDays(5), addDays(20), 40, 300, 600, 'PENDING', addDays(0));
  // Approved future rental: Sameer -> Chemistry (listing 6)
  ins.rent.run(6, sameer, addDays(10), addDays(30), 90, 900, 1800, 'APPROVED', addDays(-1));

  // Messages
  ins.msg.run(neha, ananya, 1, 'Hi! Is the DBMS book still available for pickup this week?', addDays(-1));
  ins.msg.run(ananya, neha, 1, 'Yes! I can meet Thursday at Library Desk 2 after 2 PM.', addDays(-1));
  ins.msg.run(neha, rahul, 5, 'Can I extend the thermodynamics rental by a week?', addDays(0));
  ins.msg.run(rahul, neha, 5, 'Sure, just make sure it is returned in the same condition.', addDays(0));

  // Wishlist
  ins.wish.run(sameer, 1);
  ins.wish.run(priya, 2);
  ins.wish.run(rahul, 6);

  // Reports
  ins.rep.run(6, sameer, 'Wrong price/details', 'Price seems too high compared to bookstore.');
  ins.rep.run(14, priya, 'Incorrect product', 'Condition listed as acceptable but spine is broken.');
}

module.exports = { db };