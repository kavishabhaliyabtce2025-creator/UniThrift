'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { db } = require('./lib/db');
const auth = require('./lib/auth');

const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

// ---------------- helpers ------------------------------------------------
const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
};

const html = (res, code, s, extra = {}) => {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(s);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let destroyed = false;
    req.on('data', (c) => {
      if (destroyed) return;
      size += c.length;
      if (size > 2 * 1024 * 1024) {
        destroyed = true;
        const err = new Error('Payload too large (maximum 2MB)');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (destroyed) return;
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch {
        const err = new Error('Invalid JSON body');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });

const withTx = (fn) => {
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const res = fn();
    db.exec('COMMIT');
    return res;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
};

const rateLimitMap = new Map();
const isRateLimited = (ip, action, limit = 10, windowMs = 60000) => {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    rateLimitMap.set(key, entry);
    return false;
  }
  entry.count += 1;
  rateLimitMap.set(key, entry);
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  return entry.count > limit;
};

const currentUser = (req) => {
  const token = auth.parseCookies(req)[auth.COOKIE];
  const uid = token ? auth.verifyToken(token) : null;
  if (!uid) return null;
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(uid) || null;
};

const needAuth = (user, res) => {
  if (!user) { json(res, 401, { error: 'Please log in to continue.' }); return false; }
  if (user.status === 'BLOCKED') { json(res, 403, { error: 'Your account has been blocked. Contact the admin.' }); return false; }
  return true;
};

const needAdmin = (user, res) => {
  if (!needAuth(user, res)) return false;
  if (user.role !== 'ADMIN') { json(res, 403, { error: 'Admin access required.' }); return false; }
  return true;
};

const publicUser = (u) => u ? {
  id: u.user_id, name: u.name, email: u.email, phone: u.phone,
  department: u.department, year: u.year, role: u.role, status: u.status,
  studentId: u.student_id, createdAt: u.created_at,
} : null;

const sup = (v) => (v === null || v === undefined) ? null : (typeof v === 'string' ? v.trim() : v);
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------------- listing view helpers ------------------------------------
const listingCols = `
  l.listing_id, l.status, l.listing_type, l.sale_price, l.rent_price, l.deposit, l.location, l.created_at,
  l.seller_id AS seller_id,
  p.product_name, p.description AS product_description, p.brand, p.author, p.edition, p.condition,
  p.category_id, c.category_name,
  s.name AS seller_name, s.department AS seller_dept, s.year AS seller_year,
  (SELECT ROUND(AVG(r.rating),1) FROM reviews r JOIN orders od ON od.order_id = r.order_id
     JOIN listings ll ON ll.listing_id = od.listing_id WHERE ll.seller_id = l.seller_id AND od.status='COMPLETED') AS avg_rating,
  (SELECT COUNT(*) FROM reviews r JOIN orders od ON od.order_id = r.order_id
     JOIN listings ll ON ll.listing_id = od.listing_id WHERE ll.seller_id = l.seller_id AND od.status='COMPLETED') AS rating_count,
  (SELECT COUNT(*) FROM orders od WHERE od.listing_id = l.listing_id) AS order_count`;

const listingBase = `
  FROM listings l
  JOIN products p ON p.product_id = l.product_id
  JOIN categories c ON c.category_id = p.category_id
  JOIN users s ON s.user_id = l.seller_id`;

const listingFull = `SELECT ${listingCols} ${listingBase}`;

const listingView = (row) => ({
  id: row.listing_id,
  status: row.status,
  type: row.listing_type,
  salePrice: row.sale_price,
  rentPrice: row.rent_price,
  deposit: row.deposit,
  location: row.location,
  createdAt: row.created_at,
  product: {
    name: row.product_name, description: row.product_description, brand: row.brand,
    author: row.author, edition: row.edition, condition: row.condition,
  },
  category: row.category_name || null,
  categoryId: row.category_id || null,
  seller: { id: row.seller_id, name: row.seller_name, department: row.seller_dept, year: row.seller_year },
  images: [],
  avgRating: row.avg_rating,
  ratingCount: row.rating_count,
  orderCount: row.order_count || 0,
});

const listingImages = (listingId) =>
  db.prepare('SELECT image_url, sort_order FROM product_images WHERE listing_id = ? ORDER BY sort_order').all(listingId);

const loadListing = (id) => {
  const row = db.prepare(`${listingFull} WHERE l.listing_id = ?`).get(id);
  if (!row) return null;
  const v = listingView(row);
  v.images = listingImages(id);
  v.reviews = db.prepare(`SELECT r.rating, r.comment, r.created_at, u.name AS reviewer_name
      FROM reviews r JOIN orders od ON od.order_id = r.order_id
      JOIN listings ll ON ll.listing_id = od.listing_id
      JOIN users u ON u.user_id = r.reviewer_id
      WHERE ll.listing_id = ? ORDER BY r.created_at DESC LIMIT 12`).all(id)
    .map((x) => ({ rating: x.rating, comment: x.comment, reviewerName: x.reviewer_name, createdAt: x.created_at }));
  const sellRow = db.prepare(`SELECT u.*,
      (SELECT COUNT(*) FROM listings ll WHERE ll.seller_id = u.user_id AND ll.status IN ('SOLD')) AS trades,
      (SELECT COUNT(*) FROM reviews r JOIN orders od ON od.order_id=r.order_id JOIN listings ll ON ll.listing_id=od.listing_id
        WHERE ll.seller_id=u.user_id AND od.status='COMPLETED') AS reviewCount
      FROM users u WHERE u.user_id = ?`).get(row.seller_id);
  v.seller = { ...v.seller, phone: sellRow ? sellRow.phone : null, trades: sellRow ? sellRow.trades : 0,
    sellerRating: row.avg_rating || null, reviewCount: sellRow ? sellRow.reviewCount : 0 };
  v.blocked = db.prepare(`SELECT start_date AS startDate, return_date AS returnDate, status FROM rentals
      WHERE listing_id = ? AND status IN ('APPROVED','ACTIVE') ORDER BY start_date`).all(id);
  return v;
};

const withImages = (rows) =>
  rows.map((r) => { const v = listingView(r); v.images = listingImages(r.listing_id); return v; });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const q = (name, def = null) => {
    const v = url.searchParams.get(name);
    return v === null || v === '' ? def : v;
  };
  const method = req.method.toUpperCase();
  const p = url.pathname;
  const isApi = p.startsWith('/api/');
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';

  try {
    const user = currentUser(req);

    // ---- health
    if (p === '/api/health' && method === 'GET') {
      return json(res, 200, { ok: true, db: true, time: new Date().toISOString() });
    }

    // ---- auth
    if (isApi && p === '/api/auth/me' && method === 'GET') {
      return json(res, 200, { user: publicUser(user) });
    }

    if (isApi && p === '/api/auth/register' && method === 'POST') {
      if (isRateLimited(clientIp, 'register', 5, 60000)) {
        return json(res, 429, { error: 'Too many registration requests. Please wait a minute.' });
      }
      const b = await readBody(req);
      const { studentId, name, email, phone, department, year, password } = b;
      if (!studentId || !name || !email || !phone || !department || !year || !password) {
        return json(res, 400, { error: 'All fields are required (studentId, name, email, phone, department, year, password).' });
      }
      if (String(studentId).length > 50 || String(name).length > 100 || String(email).length > 150 || String(phone).length > 30) {
        return json(res, 400, { error: 'Field length exceeds maximum limit.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))
        return json(res, 400, { error: 'Please enter a valid college email.' });
      if (String(password).length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' });
      if (String(password).length > 128) return json(res, 400, { error: 'Password cannot exceed 128 characters.' });
      const dup = db.prepare("SELECT 1 FROM users WHERE student_id = ? OR email = ? COLLATE NOCASE").get(String(studentId).trim(), String(email).trim());
      if (dup) return json(res, 409, { error: 'Student ID or email is already registered.' });
      const info = db.prepare(
        'INSERT INTO users (student_id, name, email, phone, department, year, password_hash, role) VALUES (?,?,?,?,?,?,?,?)'
      ).run(String(studentId).trim(), String(name).trim(), String(email).trim(), String(phone).trim(), String(department).trim(), String(year).trim(), auth.hashPassword(password), 'STUDENT');
      res.setHeader('Set-Cookie', auth.cookieHeader(auth.signToken(info.lastInsertRowid)));
      return json(res, 201, { user: publicUser(db.prepare('SELECT * FROM users WHERE user_id = ?').get(info.lastInsertRowid)) });
    }

    if (isApi && p === '/api/auth/login' && method === 'POST') {
      if (isRateLimited(clientIp, 'login', 10, 60000)) {
        return json(res, 429, { error: 'Too many login attempts. Please wait a minute.' });
      }
      const b = await readBody(req);
      const { email, password } = b;
      if (!email || !password) return json(res, 400, { error: 'Email and password are required.' });
      const u = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim());
      if (!u || !auth.verifyPassword(password, u.password_hash))
        return json(res, 401, { error: 'Invalid email or password.' });
      if (u.status === 'BLOCKED') return json(res, 403, { error: 'Your account has been blocked by the administrator.' });
      res.setHeader('Set-Cookie', auth.cookieHeader(auth.signToken(u.user_id)));
      return json(res, 200, { user: publicUser(u) });
    }

    if (isApi && p === '/api/auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', auth.clearCookieHeader());
      return json(res, 200, { ok: true });
    }

    if (isApi && (p === '/api/users/me' || p === '/api/auth/me') && method === 'PUT') {
      if (!needAuth(user, res)) return;
      const b = await readBody(req);
      const newName = sup(b.name) ? String(b.name).trim().slice(0, 100) : user.name;
      const newPhone = sup(b.phone) ? String(b.phone).trim().slice(0, 30) : user.phone;
      const newYear = sup(b.year) ? String(b.year).trim().slice(0, 20) : user.year;
      const newDept = sup(b.department) ? String(b.department).trim().slice(0, 50) : user.department;
      db.prepare('UPDATE users SET name=?, phone=?, year=?, department=? WHERE user_id=?')
        .run(newName, newPhone, newYear, newDept, user.user_id);
      return json(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE user_id=?').get(user.user_id)) });
    }

    // ---- categories
    if (isApi && p === '/api/categories' && method === 'GET') {
      const rows = db.prepare(`SELECT c.category_id, c.category_name, c.description,
          (SELECT COUNT(*) FROM products p WHERE p.category_id = c.category_id) AS product_count
          FROM categories c ORDER BY c.category_name`).all();
      return json(res, 200, { categories: rows });
    }

    // ---- listings (public)
    if (isApi && p === '/api/listings' && method === 'GET') {
      const where = [];
      const params = [];
      if (q('available') !== '0') where.push("l.status = 'AVAILABLE'");
      else where.push("l.status IN ('AVAILABLE','RESERVED','RENTED')");
      const term = q('q');
      if (term) {
        where.push('(p.product_name LIKE ? OR p.author LIKE ? OR p.brand LIKE ? OR p.description LIKE ? OR c.category_name LIKE ?)');
        const like = `%${term}%`; params.push(like, like, like, like, like);
      }
      const type = q('type');
      if (type === 'sale') where.push("l.listing_type IN ('SALE','BOTH')");
      else if (type === 'rent') where.push("l.listing_type IN ('RENT','BOTH')");
      if (q('category')) { where.push('c.category_name = ?'); params.push(q('category')); }
      if (q('condition')) { where.push('p.condition = ?'); params.push(q('condition')); }
      if (q('dept')) { where.push('s.department = ?'); params.push(q('dept')); }
      const minP = num(q('minPrice')), maxP = num(q('maxPrice'));
      if (minP !== null || maxP !== null) {
        const expr = `COALESCE(CASE WHEN l.listing_type IN ('SALE','BOTH') THEN l.sale_price ELSE l.rent_price END, l.sale_price, l.rent_price)`;
        where.push(`${expr} >= ?`); params.push(minP !== null ? minP : 0);
        where.push(`${expr} <= ?`); params.push(maxP !== null ? maxP : 1e9);
      }
      const orderBy = {
        'newest': 'l.created_at DESC',
        'oldest': 'l.created_at ASC',
        'price-low': `COALESCE(CASE WHEN l.listing_type IN ('SALE','BOTH') THEN l.sale_price ELSE l.rent_price END, l.sale_price, l.rent_price) ASC`,
        'price-high': `COALESCE(CASE WHEN l.listing_type IN ('SALE','BOTH') THEN l.sale_price ELSE l.rent_price END, l.sale_price, l.rent_price) DESC`,
      }[q('sort')] || 'l.listing_id DESC';
      const rows = db.prepare(`${listingFull} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`).all(...params);
      return json(res, 200, { listings: withImages(rows), total: rows.length });
    }

    if (isApi && /^\/api\/listings\/\d+\/?$/.test(p) && method === 'GET') {
      const id = Number(p.split('/')[3]);
      const v = loadListing(id);
      if (!v) return json(res, 404, { error: 'Listing not found.' });
      const related = db.prepare(`${listingFull} WHERE l.status='AVAILABLE' AND l.listing_id != ? AND p.category_id = ? ORDER BY l.created_at DESC LIMIT 4`).all(id, v.categoryId);
      return json(res, 200, { listing: v, related: withImages(related) });
    }

    if (isApi && /^\/api\/listings\/\d+\/availability\/?$/.test(p) && method === 'GET') {
      const id = Number(p.split('/')[3]);
      const start = q('start'), end = q('end');
      if (!start || !end) return json(res, 400, { error: 'start and end dates are required.' });
      const clash = db.prepare(`SELECT rental_id, start_date AS startDate, return_date AS returnDate, status FROM rentals
          WHERE listing_id = ? AND status IN ('PENDING','APPROVED','ACTIVE','OVERDUE')
          AND start_date < ? AND return_date > ?`).all(id, end, start);
      return json(res, 200, { available: clash.length === 0, conflicts: clash });
    }

    // ---- create listing (student)
    if (isApi && p === '/api/listings' && method === 'POST') {
      if (!needAuth(user, res)) return;
      const b = await readBody(req);
      const { name, category, description, brand, author, edition, condition, type, salePrice, rentPrice, deposit, location } = b;
      if (!name || !category || !description || !condition || !location)
        return json(res, 400, { error: 'name, category, description, condition and location are required.' });
      if (String(name).length > 200 || String(description).length > 3000 || String(location).length > 200)
        return json(res, 400, { error: 'Input field exceeds maximum allowed length.' });
      const ltype = ['SALE', 'RENT', 'BOTH'].includes(type) ? type : 'SALE';
      const cat = db.prepare("SELECT * FROM categories WHERE category_name = ? COLLATE NOCASE").get(String(category).trim());
      if (!cat) {
        return json(res, 400, { error: `Category '${category}' not found. Please select an approved campus category.` });
      }
      const sale = num(salePrice), rent = num(rentPrice), dep = num(deposit);
      if (sale !== null && sale < 0) return json(res, 400, { error: 'Sale price cannot be negative.' });
      if (rent !== null && rent < 0) return json(res, 400, { error: 'Rental price cannot be negative.' });
      if (dep !== null && dep < 0) return json(res, 400, { error: 'Deposit cannot be negative.' });

      const lid = withTx(() => {
        const pInfo = db.prepare('INSERT INTO products (category_id, product_name, description, brand, author, edition, condition) VALUES (?,?,?,?,?,?,?)')
          .run(cat.category_id, String(name).trim().slice(0, 200), String(description).trim().slice(0, 3000), sup(brand), sup(author), sup(edition), String(condition).trim().slice(0, 50));
        const lInfo = db.prepare(`INSERT INTO listings (product_id, seller_id, listing_type, sale_price, rent_price, deposit, location, status)
            VALUES (?,?,?,?,?,?,?,'PENDING')`)
          .run(pInfo.lastInsertRowid, user.user_id, ltype, sale, rent, dep ?? 0, String(location).trim().slice(0, 200));
        const newLid = lInfo.lastInsertRowid;
        if (Array.isArray(b.images) && b.images.length) {
          b.images.filter(Boolean).slice(0, 4).forEach((u, i) =>
            db.prepare('INSERT INTO product_images (listing_id, image_url, sort_order) VALUES (?,?,?)').run(newLid, String(u).slice(0, 1000), i));
        } else {
          db.prepare('INSERT INTO product_images (listing_id, image_url, sort_order) VALUES (?,?,?)')
            .run(newLid, `https://picsum.photos/seed/ct-${newLid}/600/450`, 0);
        }
        return newLid;
      });

      return json(res, 201, { listing: loadListing(lid), message: 'Listing submitted for admin approval.' });
    }

    if (isApi && /^\/api\/listings\/\d+\/?$/.test(p) && method === 'DELETE') {
      if (!needAuth(user, res)) return;
      const id = Number(p.split('/')[3]);
      const row = db.prepare('SELECT * FROM listings WHERE listing_id=?').get(id);
      if (!row) return json(res, 404, { error: 'Listing not found.' });
      if (row.seller_id !== user.user_id) return json(res, 403, { error: 'Only the seller can remove this listing.' });
      if (['SOLD', 'REMOVED', 'REJECTED'].includes(row.status)) return json(res, 409, { error: `Listing is already ${row.status.toLowerCase()} and cannot be removed.` });
      withTx(() => {
        db.prepare('UPDATE listings SET status = ? WHERE listing_id = ?').run('REMOVED', id);
        db.prepare("UPDATE orders SET status='CANCELLED' WHERE listing_id=? AND status='PENDING'").run(id);
      });
      return json(res, 200, { message: 'Listing removed.' });
    }

    // ---- my data
    if (isApi && p === '/api/my/listings' && method === 'GET') {
      if (!needAuth(user, res)) return;
      const rows = db.prepare(`${listingFull} WHERE l.seller_id = ? ORDER BY l.created_at DESC`).all(user.user_id);
      return json(res, 200, { listings: withImages(rows) });
    }

    if (isApi && p === '/api/my/orders' && method === 'GET') {
      if (!needAuth(user, res)) return;
      const asBuyerSql = `SELECT ${listingCols}, od.order_id AS order_id, od.status AS order_status, od.amount AS amount,
          od.order_date AS order_date, (rv.review_id IS NOT NULL) AS reviewed
        ${listingBase}
        JOIN orders od ON od.listing_id = l.listing_id
        LEFT JOIN reviews rv ON rv.order_id = od.order_id AND rv.reviewer_id = od.buyer_id
        WHERE od.buyer_id = ? ORDER BY od.order_date DESC`;
      const asSellerSql = `SELECT ${listingCols}, od.order_id AS order_id, od.status AS order_status, od.amount AS amount,
          od.order_date AS order_date, (rv.review_id IS NOT NULL) AS reviewed
        ${listingBase}
        JOIN orders od ON od.listing_id = l.listing_id
        LEFT JOIN reviews rv ON rv.order_id = od.order_id AND rv.reviewer_id = od.buyer_id
        WHERE l.seller_id = ? ORDER BY od.order_date DESC`;
      const map = (r) => ({
        id: r.order_id, status: r.order_status, amount: r.amount, date: r.order_date,
        listing: listingView(r), reviewed: !!r.reviewed,
      });
      return json(res, 200, {
        asBuyer: db.prepare(asBuyerSql).all(user.user_id).map(map),
        asSeller: db.prepare(asSellerSql).all(user.user_id).map(map),
      });
    }

    if (isApi && p === '/api/my/rentals' && method === 'GET') {
      if (!needAuth(user, res)) return;
      const sql = (side) => `SELECT ${listingCols}, rr.rental_id AS rental_id, rr.status AS rent_status,
          rr.start_date AS start_date, rr.return_date AS return_date, rr.price_per_day AS price_per_day,
          rr.deposit AS rent_deposit, rr.total_amount AS total_amount, rr.created_at AS rent_created,
          partner.name AS partner_name, partner.user_id AS partner_id
        ${listingBase}
        JOIN rentals rr ON rr.listing_id = l.listing_id
        JOIN users partner ON partner.user_id = ${side === 'renter' ? 'l.seller_id' : 'rr.renter_id'}
        ${side === 'renter' ? 'WHERE rr.renter_id = ?' : 'WHERE l.seller_id = ?'}
        ORDER BY rr.created_at DESC`;
      const map = (r) => ({
        id: r.rental_id, status: r.rent_status, startDate: r.start_date, returnDate: r.return_date,
        pricePerDay: r.price_per_day, deposit: r.rent_deposit, totalAmount: r.total_amount, createdAt: r.rent_created,
        partner: { id: r.partner_id, name: r.partner_name },
        listing: listingView(r),
      });
      return json(res, 200, {
        asRenter: db.prepare(sql('renter')).all(user.user_id).map(map),
        asSeller: db.prepare(sql('seller')).all(user.user_id).map(map),
      });
    }

    if (isApi && p === '/api/my/wishlist' && method === 'GET') {
      if (!needAuth(user, res)) return;
      const rows = db.prepare(`SELECT ${listingCols} ${listingBase}
          JOIN wishlist wl ON wl.listing_id = l.listing_id
          WHERE wl.user_id = ? ORDER BY wl.created_at DESC`).all(user.user_id);
      return json(res, 200, { wishlist: withImages(rows) });
    }

    // ---- buy / orders
    if (isApi && p === '/api/orders' && method === 'POST') {
      if (!needAuth(user, res)) return;
      const b = await readBody(req);
      const lid = num(b.listingId);
      if (!lid) return json(res, 400, { error: 'listingId is required.' });
      const row = db.prepare(`${listingFull} WHERE l.listing_id = ?`).get(lid);
      if (!row) return json(res, 404, { error: 'Listing not found.' });
      if (row.seller_id === user.user_id) return json(res, 400, { error: 'You cannot purchase your own listing.' });
      if (!['SALE', 'BOTH'].includes(row.listing_type)) return json(res, 400, { error: 'This item is not for sale.' });
      if (row.status !== 'AVAILABLE') return json(res, 409, { error: `This item is not available (${row.status}).` });
      const amount = num(row.sale_price) ?? 0;
      const methodPay = ['Cash on Campus', 'Campus UPI', 'Online'].includes(b.paymentMethod) ? b.paymentMethod : 'Cash on Campus';
      const oId = withTx(() => {
        const oInfo = db.prepare("INSERT INTO orders (buyer_id, listing_id, amount, status) VALUES (?,?,?,'PENDING')").run(user.user_id, lid, amount);
        db.prepare("INSERT INTO payments (order_id, amount, payment_method, payment_status) VALUES (?,?,?,'PENDING')").run(oInfo.lastInsertRowid, amount, methodPay);
        return oInfo.lastInsertRowid;
      });
      return json(res, 201, { orderId: oId, message: 'Purchase request sent to the seller.' });
    }

    if (isApi && /^\/api\/orders\/\d+\/?$/.test(p) && method === 'PUT') {
      if (!needAuth(user, res)) return;
      const id = Number(p.split('/')[3]);
      const b = await readBody(req);
      const o = db.prepare('SELECT o.*, l.seller_id FROM orders o JOIN listings l ON l.listing_id = o.listing_id WHERE o.order_id = ?').get(id);
      if (!o) return json(res, 404, { error: 'Order not found.' });
      const isSeller = o.seller_id === user.user_id;
      const isBuyer = o.buyer_id === user.user_id;
      const act = b.action;
      if (!['accept', 'reject', 'complete', 'cancel'].includes(act)) return json(res, 400, { error: 'action must be accept|reject|complete|cancel' });
      if (['accept', 'reject', 'complete'].includes(act) && !isSeller) return json(res, 403, { error: 'Only the seller can take this action.' });
      if (act === 'cancel' && !isBuyer && !isSeller) return json(res, 403, { error: 'Only the buyer or seller can cancel.' });
      const updOrder = (status, lstatus = null, pay = null) => {
        withTx(() => {
          db.prepare('UPDATE orders SET status = ? WHERE order_id = ?').run(status, id);
          if (lstatus) db.prepare('UPDATE listings SET status = ? WHERE listing_id = ?').run(lstatus, o.listing_id);
          if (pay === 'complete') db.prepare("UPDATE payments SET payment_status='COMPLETED', payment_date=datetime('now') WHERE order_id=?").run(id);
          if (pay === 'refund') db.prepare("UPDATE payments SET payment_status='REFUNDED' WHERE order_id=?").run(id);
        });
      };
      if (act === 'accept') {
        if (o.status !== 'PENDING') return json(res, 409, { error: `Order is already ${o.status}.` });
        updOrder('ACCEPTED', 'RESERVED', 'complete');
      } else if (act === 'reject') {
        if (o.status !== 'PENDING') return json(res, 409, { error: `Order is already ${o.status}.` });
        updOrder('REJECTED', 'AVAILABLE');
      } else if (act === 'complete') {
        if (o.status !== 'ACCEPTED') return json(res, 409, { error: 'Only accepted orders can be completed.' });
        updOrder('COMPLETED', 'SOLD');
      } else if (act === 'cancel') {
        if (!['PENDING', 'ACCEPTED'].includes(o.status)) return json(res, 409, { error: `Cannot cancel a ${o.status} order.` });
        const wasAccepted = o.status === 'ACCEPTED';
        updOrder('CANCELLED', wasAccepted ? 'AVAILABLE' : null, wasAccepted ? 'refund' : null);
      }
      return json(res, 200, { message: `Order ${act}ed.` });
    }

    // ---- rentals (date-overlap checked, PRD §19)
    if (isApi && p === '/api/rentals' && method === 'POST') {
      if (!needAuth(user, res)) return;
      const b = await readBody(req);
      const lid = num(b.listingId), start = sup(b.startDate), end = sup(b.returnDate);
      if (!lid || !start || !end) return json(res, 400, { error: 'listingId, startDate and returnDate are required.' });
      const today = new Date().toISOString().slice(0, 10);
      if (start < today) return json(res, 400, { error: 'Start date cannot be in the past.' });
      if (start >= end) return json(res, 400, { error: 'Return date must be after the start date.' });
      const row = db.prepare(`${listingFull} WHERE l.listing_id = ?`).get(lid);
      if (!row) return json(res, 404, { error: 'Listing not found.' });
      if (row.seller_id === user.user_id) return json(res, 400, { error: 'You cannot rent your own listing.' });
      if (!['RENT', 'BOTH'].includes(row.listing_type)) return json(res, 400, { error: 'This item is not available for rent.' });
      if (row.status !== 'AVAILABLE' && row.status !== 'RENTED')
        return json(res, 409, { error: `Item cannot be rented right now (${row.status}).` });
      const clash = db.prepare(`SELECT rental_id FROM rentals WHERE listing_id = ? AND status IN ('PENDING','APPROVED','ACTIVE','OVERDUE')
          AND start_date < ? AND return_date > ?`).all(lid, end, start);
      if (clash.length) return json(res, 409, { error: 'This date range overlaps an existing rental. Please pick different dates.' });
      const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000));
      if (days > 180) return json(res, 400, { error: 'Rental duration cannot exceed 180 days (one semester).' });
      const total = Number((days * row.rent_price + (row.deposit || 0)).toFixed(2));
      const info = db.prepare(`INSERT INTO rentals (listing_id, renter_id, start_date, return_date, price_per_day, deposit, total_amount, status)
          VALUES (?,?,?,?,?,?,?,'PENDING')`).run(lid, user.user_id, start, end, row.rent_price, row.deposit || 0, total);
      return json(res, 201, { rentalId: info.lastInsertRowid, totalAmount: total, days, message: 'Rental request sent to the seller.' });
    }

    if (isApi && /^\/api\/rentals\/\d+\/?$/.test(p) && method === 'PUT') {
      if (!needAuth(user, res)) return;
      const id = Number(p.split('/')[3]);
      const b = await readBody(req);
      const r = db.prepare('SELECT r.*, l.seller_id FROM rentals r JOIN listings l ON l.listing_id = r.listing_id WHERE r.rental_id = ?').get(id);
      if (!r) return json(res, 404, { error: 'Rental not found.' });
      const isSeller = r.seller_id === user.user_id;
      const isRenter = r.renter_id === user.user_id;
      const act = b.action;
      const upd = (status, lstatus = null) => {
        db.prepare('UPDATE rentals SET status = ? WHERE rental_id = ?').run(status, id);
        if (lstatus) db.prepare('UPDATE listings SET status = ? WHERE listing_id = ?').run(lstatus, r.listing_id);
      };
      if (act === 'approve') {
        if (!isSeller) return json(res, 403, { error: 'Only the seller can approve.' });
        if (r.status !== 'PENDING') return json(res, 409, { error: `Rental is already ${r.status}.` });
        const today = new Date().toISOString().slice(0, 10);
        upd(r.start_date <= today ? 'ACTIVE' : 'APPROVED', 'RENTED');
      } else if (act === 'reject') {
        if (!isSeller) return json(res, 403, { error: 'Only the seller can reject.' });
        if (r.status !== 'PENDING') return json(res, 409, { error: `Rental is already ${r.status}.` });
        upd('REJECTED');
      } else if (act === 'cancel') {
        if (!isRenter && !isSeller) return json(res, 403, { error: 'Only the renter or seller can cancel.' });
        if (!['PENDING', 'APPROVED'].includes(r.status)) return json(res, 409, { error: `Cannot cancel a ${r.status} rental.` });
        upd('CANCELLED');
      } else if (act === 'return') {
        if (!isRenter && !isSeller) return json(res, 403, { error: 'Only the renter or seller can mark as returned.' });
        if (!['ACTIVE', 'APPROVED'].includes(r.status)) return json(res, 409, { error: `Rental is not active (${r.status}).` });
        upd('RETURNED', 'AVAILABLE');
      } else {
        return json(res, 400, { error: 'action must be approve|reject|cancel|return' });
      }
      return json(res, 200, { message: `Rental ${act}ed.` });
    }

    // ---- wishlist / messages / reviews / reports
    if (isApi && /^\/api\/wishlist\/\d+\/?$/.test(p) && method === 'POST') {
      if (!needAuth(user, res)) return;
      const lid = Number(p.split('/')[3]);
      if (!db.prepare('SELECT 1 FROM listings WHERE listing_id = ?').get(lid)) return json(res, 404, { error: 'Listing not found.' });
      db.prepare('INSERT OR IGNORE INTO wishlist (user_id, listing_id) VALUES (?,?)').run(user.user_id, lid);
      return json(res, 201, { wishlisted: true });
    }
    if (isApi && /^\/api\/wishlist\/\d+\/?$/.test(p) && method === 'DELETE') {
      if (!needAuth(user, res)) return;
      const lid = Number(p.split('/')[3]);
      db.prepare('DELETE FROM wishlist WHERE user_id = ? AND listing_id = ?').run(user.user_id, lid);
      return json(res, 200, { wishlisted: false });
    }

    if (isApi && p === '/api/messages' && method === 'GET') {
      if (!needAuth(user, res)) return;
      const other = q('otherId');
      if (other) {
        const oid = Number(other);
        const rows = db.prepare(`SELECT m.*, u.name AS sender_name
            FROM messages m JOIN users u ON u.user_id = m.sender_id
            WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.sent_at ASC`).all(user.user_id, oid, oid, user.user_id);
        return json(res, 200, { messages: rows });
      }
      const convos = db.prepare(`
        SELECT partner.user_id AS other_id, partner.name AS other_name, partner.department AS other_dept,
               m.listing_id AS listing_id, m.message AS last_message, m.sent_at AS last_at,
               (SELECT p.product_name FROM products p JOIN listings l ON l.product_id = p.product_id WHERE l.listing_id = m.listing_id) AS listing_name
        FROM messages m
        JOIN users partner ON partner.user_id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
        WHERE m.sender_id = ? OR m.receiver_id = ?
        GROUP BY partner.user_id, m.listing_id
        ORDER BY m.sent_at DESC`).all(user.user_id, user.user_id, user.user_id);
      return json(res, 200, { conversations: convos });
    }
    if (isApi && p === '/api/messages' && method === 'POST') {
      if (!needAuth(user, res)) return;
      const b = await readBody(req);
      const receiver = num(b.receiverId), text = sup(b.message);
      if (!receiver || !text) return json(res, 400, { error: 'receiverId and message are required.' });
      if (receiver === user.user_id) return json(res, 400, { error: 'You cannot message yourself.' });
      if (!db.prepare('SELECT 1 FROM users WHERE user_id = ?').get(receiver)) return json(res, 404, { error: 'Recipient not found.' });
      db.prepare('INSERT INTO messages (sender_id, receiver_id, listing_id, message) VALUES (?,?,?,?)')
        .run(user.user_id, receiver, sup(b.listingId) !== null ? num(b.listingId) : null, text);
      return json(res, 201, { message: 'Message sent.' });
    }

    if (isApi && p === '/api/reviews' && method === 'POST') {
      if (!needAuth(user, res)) return;
      const b = await readBody(req);
      const oid = num(b.orderId), rating = num(b.rating);
      if (!oid) return json(res, 400, { error: 'orderId is required.' });
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(res, 400, { error: 'Rating must be an integer between 1 and 5.' });
      const o = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(oid);
      if (!o) return json(res, 404, { error: 'Order not found.' });
      if (o.buyer_id !== user.user_id) return json(res, 403, { error: 'Only the buyer can review this order.' });
      if (o.status !== 'COMPLETED') return json(res, 409, { error: 'Only completed orders can be reviewed.' });
      if (db.prepare('SELECT 1 FROM reviews WHERE order_id = ? AND reviewer_id = ?').get(oid, user.user_id))
        return json(res, 409, { error: 'You already reviewed this order.' });
      db.prepare('INSERT INTO reviews (order_id, reviewer_id, rating, comment) VALUES (?,?,?,?)')
        .run(oid, user.user_id, rating, sup(b.comment) || null);
      return json(res, 201, { message: 'Review submitted. Thank you!' });
    }

    if (isApi && p === '/api/reports' && method === 'POST') {
      if (!needAuth(user, res)) return;
      const b = await readBody(req);
      const lid = num(b.listingId), reason = sup(b.reason);
      if (!lid || !reason) return json(res, 400, { error: 'listingId and reason are required.' });
      if (!db.prepare('SELECT 1 FROM listings WHERE listing_id = ?').get(lid)) return json(res, 404, { error: 'Listing not found.' });
      db.prepare('INSERT INTO reports (listing_id, reported_by, reason, description) VALUES (?,?,?,?)')
        .run(lid, user.user_id, reason, sup(b.description) || null);
      return json(res, 201, { message: 'Report submitted. The admin will review it.' });
    }

    // ===================== ADMIN =====================
    if (isApi && p === '/api/admin/stats' && method === 'GET') {
      if (!needAdmin(user, res)) return;
      const one = (sql, ...a) => db.prepare(sql).get(...a);
      const stats = {
        students: one("SELECT COUNT(*) n FROM users WHERE role='STUDENT'").n,
        activeListings: one("SELECT COUNT(*) n FROM listings WHERE status='AVAILABLE'").n,
        pendingListings: one("SELECT COUNT(*) n FROM listings WHERE status='PENDING'").n,
        soldListings: one("SELECT COUNT(*) n FROM listings WHERE status='SOLD'").n,
        pendingOrders: one("SELECT COUNT(*) n FROM orders WHERE status='PENDING'").n,
        completedSales: one("SELECT COUNT(*) n FROM orders WHERE status='COMPLETED'").n,
        activeRentals: one("SELECT COUNT(*) n FROM rentals WHERE status='ACTIVE'").n,
        approvedRentals: one("SELECT COUNT(*) n FROM rentals WHERE status='APPROVED'").n,
        pendingRentals: one("SELECT COUNT(*) n FROM rentals WHERE status='PENDING'").n,
        overdueRentals: one("SELECT COUNT(*) n FROM rentals WHERE status='ACTIVE' AND return_date < date('now')").n,
        returnedRentals: one("SELECT COUNT(*) n FROM rentals WHERE status='RETURNED'").n,
        openReports: one("SELECT COUNT(*) n FROM reports WHERE status='OPEN'").n,
        totalReports: one("SELECT COUNT(*) n FROM reports").n,
        salesVolume: one("SELECT COALESCE(SUM(amount),0) v FROM orders WHERE status IN ('ACCEPTED','COMPLETED')").v,
        usersByDept: db.prepare("SELECT department, COUNT(*) n FROM users WHERE role='STUDENT' GROUP BY department ORDER BY n DESC").all(),
        listingsByCategory: db.prepare(`SELECT c.category_name, COUNT(*) n FROM listings l
            JOIN products p ON p.product_id=l.product_id JOIN categories c ON c.category_id=p.category_id
            GROUP BY c.category_name ORDER BY n DESC`).all(),
      };
      return json(res, 200, { stats });
    }

    if (isApi && p === '/api/admin/users' && method === 'GET') {
      if (!needAdmin(user, res)) return;
      const rows = db.prepare(`SELECT u.*,
          (SELECT COUNT(*) FROM listings l WHERE l.seller_id=u.user_id) AS listings,
          (SELECT COUNT(*) FROM orders o WHERE o.buyer_id=u.user_id) AS orders,
          (SELECT COUNT(*) FROM reports r WHERE r.reported_by=u.user_id) AS reports
          FROM users u ORDER BY u.created_at DESC`).all();
      return json(res, 200, { users: rows.map((u) => ({ ...publicUser(u), listings: u.listings, orders: u.orders, reports: u.reports })) });
    }
    if (isApi && /^\/api\/admin\/users\/\d+\/?$/.test(p) && method === 'PATCH') {
      if (!needAdmin(user, res)) return;
      const id = Number(p.split('/')[4]);
      const b = await readBody(req);
      const status = b.status === 'ACTIVE' ? 'ACTIVE' : b.status === 'BLOCKED' ? 'BLOCKED' : null;
      if (!status) return json(res, 400, { error: 'status must be ACTIVE or BLOCKED.' });
      const target = db.prepare("SELECT * FROM users WHERE user_id=? AND role='STUDENT'").get(id);
      if (!target) return json(res, 404, { error: 'Student not found.' });
      db.prepare('UPDATE users SET status=? WHERE user_id=?').run(status, id);
      return json(res, 200, { message: `Student ${status === 'BLOCKED' ? 'blocked' : 'activated'}.` });
    }

    if (isApi && p === '/api/admin/listings' && method === 'GET') {
      if (!needAdmin(user, res)) return;
      const st = q('status', 'ALL');
      const rows = db.prepare(`${listingFull} ${st && st !== 'ALL' ? 'WHERE l.status = ?' : ''} ORDER BY l.created_at DESC`)
        .all(...(st && st !== 'ALL' ? [st] : []));
      return json(res, 200, { listings: withImages(rows) });
    }
    if (isApi && /^\/api\/admin\/listings\/\d+\/?$/.test(p) && method === 'PATCH') {
      if (!needAdmin(user, res)) return;
      const id = Number(p.split('/')[4]);
      const b = await readBody(req);
      const map = { APPROVE: ['AVAILABLE', 'approved'], REJECT: ['REJECTED', 'rejected'], REMOVE: ['REMOVED', 'removed'] };
      if (!map[b.action]) return json(res, 400, { error: 'action must be APPROVE|REJECT|REMOVE' });
      db.prepare('UPDATE listings SET status = ? WHERE listing_id = ?').run(map[b.action][0], id);
      return json(res, 200, { message: `Listing ${map[b.action][1]}.` });
    }

    if (isApi && p === '/api/admin/categories' && method === 'POST') {
      if (!needAdmin(user, res)) return;
      const b = await readBody(req);
      const name = sup(b.name), desc = sup(b.description);
      if (!name) return json(res, 400, { error: 'Category name is required.' });
      if (db.prepare('SELECT 1 FROM categories WHERE category_name = ? COLLATE NOCASE').get(name))
        return json(res, 409, { error: 'Category already exists.' });
      const info = db.prepare('INSERT INTO categories (category_name, description) VALUES (?,?)').run(name, desc || null);
      return json(res, 201, { category: db.prepare('SELECT * FROM categories WHERE category_id=?').get(info.lastInsertRowid) });
    }
    if (isApi && /^\/api\/admin\/categories\/\d+\/?$/.test(p) && ['PUT', 'DELETE'].includes(method)) {
      if (!needAdmin(user, res)) return;
      const id = Number(p.split('/')[4]);
      if (method === 'PUT') {
        const b = await readBody(req);
        db.prepare('UPDATE categories SET category_name=?, description=? WHERE category_id=?')
          .run(sup(b.name), sup(b.description) || null, id);
        return json(res, 200, { category: db.prepare('SELECT * FROM categories WHERE category_id=?').get(id) });
      }
      if (db.prepare('SELECT 1 FROM products WHERE category_id=? LIMIT 1').get(id))
        return json(res, 409, { error: 'Category is in use and cannot be deleted.' });
      db.prepare('DELETE FROM categories WHERE category_id=?').run(id);
      return json(res, 200, { message: 'Category deleted.' });
    }

    if (isApi && p === '/api/admin/orders' && method === 'GET') {
      if (!needAdmin(user, res)) return;
      const rows = db.prepare(`SELECT ${listingCols}, od.order_id AS order_id, od.status AS order_status, od.amount AS amount,
          od.order_date AS order_date, od.buyer_id AS buyer_id,
          pm.payment_status AS payment_status, pm.payment_method AS payment_method,
          buyer.name AS buyer_name, buyer.department AS buyer_dept,
          (rv.review_id IS NOT NULL) AS reviewed
        ${listingBase}
        JOIN orders od ON od.listing_id = l.listing_id
        JOIN users buyer ON buyer.user_id = od.buyer_id
        LEFT JOIN payments pm ON pm.order_id = od.order_id
        LEFT JOIN reviews rv ON rv.order_id = od.order_id AND rv.reviewer_id = od.buyer_id
        ORDER BY od.order_date DESC`).all();
      return json(res, 200, { orders: rows.map((r) => ({
        id: r.order_id, status: r.order_status, amount: r.amount, date: r.order_date,
        paymentStatus: r.payment_status, paymentMethod: r.payment_method,
        buyer: { name: r.buyer_name, dept: r.buyer_dept },
        listing: listingView(r), reviewed: !!r.reviewed,
      })) });
    }

    if (isApi && p === '/api/admin/rentals' && method === 'GET') {
      if (!needAdmin(user, res)) return;
      const rows = db.prepare(`SELECT ${listingCols}, rr.rental_id AS rental_id, rr.status AS rent_status,
          rr.start_date AS start_date, rr.return_date AS return_date, rr.total_amount AS total_amount,
          rr.price_per_day AS price_per_day, rr.deposit AS rent_deposit,
          renter.name AS renter_name, renter.department AS renter_dept
        ${listingBase}
        JOIN rentals rr ON rr.listing_id = l.listing_id
        JOIN users renter ON renter.user_id = rr.renter_id
        ORDER BY rr.created_at DESC`).all();
      return json(res, 200, { rentals: rows.map((r) => ({
        id: r.rental_id, status: r.rent_status, startDate: r.start_date, returnDate: r.return_date,
        totalAmount: r.total_amount, pricePerDay: r.price_per_day, deposit: r.rent_deposit,
        renter: { name: r.renter_name, dept: r.renter_dept },
        listing: listingView(r),
      })) });
    }

    if (isApi && p === '/api/admin/reports' && method === 'GET') {
      if (!needAdmin(user, res)) return;
      const rows = db.prepare(`SELECT rp.*, u.name AS reporter,
          p.product_name AS listing_name, s.name AS seller_name, s.user_id AS seller_id
          FROM reports rp
          JOIN users u ON u.user_id = rp.reported_by
          JOIN listings l ON l.listing_id = rp.listing_id
          JOIN products p ON p.product_id = l.product_id
          JOIN users s ON s.user_id = l.seller_id
          ORDER BY rp.created_at DESC`).all();
      return json(res, 200, { reports: rows });
    }
    if (isApi && /^\/api\/admin\/reports\/\d+\/?$/.test(p) && method === 'PATCH') {
      if (!needAdmin(user, res)) return;
      const id = Number(p.split('/')[4]);
      const b = await readBody(req);
      const status = b.action === 'RESOLVE' ? 'RESOLVED' : b.action === 'DISMISS' ? 'DISMISSED' : null;
      if (!status) return json(res, 400, { error: 'action must be RESOLVE or DISMISS.' });
      db.prepare('UPDATE reports SET status=? WHERE report_id=?').run(status, id);
      return json(res, 200, { message: `Report ${status.toLowerCase()}.` });
    }

    // ============ static files ============
    if (isApi) return json(res, 404, { error: 'API endpoint not found.' });

    let filePath = path.normalize(path.join(PUBLIC, p === '/' ? '/index.html' : p));
    if (!filePath.startsWith(PUBLIC)) return html(res, 403, 'Forbidden');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');

    if (!fs.existsSync(filePath)) return html(res, 404, '<h1>404 Not Found</h1><p><a href="/">Back to UniThrift</a></p>');

    let content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    if (ext === '.html') {
      let s = content.toString('utf8');
      const rel = '/' + path.relative(PUBLIC, filePath).replace(/\\/g, '/');
      let dirty = false;
      // favicon link on every page (idempotent)
      if (!s.includes('ct-favicon')) {
        s = s.replace('</head>',
          '<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">\n<link rel="shortcut icon" href="/assets/favicon.svg">\n<!-- ct-favicon -->\n</head>');
        dirty = true;
      }
      // page scripts (one-time injection)
      if (!s.includes('ct-injected')) {
        const inject = {
          '/index.html': ['marketplace', 'marketplace.js'],
          '/browse.html': ['marketplace', 'marketplace.js'],
          '/product.html': ['product', 'product.js'],
          '/post.html': ['post', 'post.js'],
          '/admin.html': ['admin', 'admin.js'],
        }[rel];
        if (inject && !s.includes('/js/app.js')) {
          s = s.replace('</body>',
            `<!-- ct-injected -->\n<script src="/js/app.js" data-page="${inject[0]}"></script>\n<script src="/js/${inject[1]}" defer></script>\n</body>`);
          dirty = true;
        }
      }
      if (dirty) content = Buffer.from(s, 'utf8');
    }
    const mime = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    return res.end(content);
  } catch (err) {
    console.error('ERROR:', err);
    const status = (err && err.statusCode) || 500;
    const msg = status < 500 ? (err.message || 'Client error') : 'Internal server error';
    return json(res, status, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`\n  UniThrift marketplace running:`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log(`  Demo admin  : admin@campus.edu / Admin@123`);
  console.log(`  Demo student: ananya@campus.edu / Student@123\n`);
});