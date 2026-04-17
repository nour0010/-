// ============================================================
// Areej Elite — Supabase API Layer مع الصور
// File: supabase-api.js
// ── نسخ هذا الملف بجانب ملف الموقع واستدعاؤه قبل الـ script الرئيسي ──
// ============================================================

// ── 1. SETUP ─────────────────────────────────────────────────
// npm install @supabase/supabase-js
// أو عبر CDN في HTML:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL  = 'https://lfzwynjzvqoctvftpxpi.supabase.co';   // ← ضع رابطك
const SUPABASE_KEY  = 'sb_publishable_TlRYqmbrEq4poa26RcoeVQ_wDtzWDUP';               // ← anon key فقط

const { createClient } = supabase;

/** رابط إرجاع المستخدم بعد الضغط على رابط البريد — يجب إضافته في Supabase: Authentication → URL Configuration → Redirect URLs */
function authRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${window.location.pathname}${window.location.search || ''}`;
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  }
});

// صورة افتراضية في حالة عدم وجود صورة للمنتج
const DEFAULT_PRODUCT_IMAGE = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"%3E%3Crect fill="%23eef0f8" width="400" height="400"/%3E%3Ctext x="200" y="200" font-size="60" text-anchor="middle" dominant-baseline="middle" fill="%237b7b9d"%3E📦%3C/text%3E%3C/svg%3E';

/**
 * بريد المسؤولين المسموح لهم بالوصول للوحة الإدارة بدون ضبط Metadata.
 * أضف بريدك هنا (بأحرف صغيرة) ثم احفظ الملف، مثال:
 * const ADMIN_EMAIL_ALLOWLIST = ['myname@gmail.com'];
 * الأفضل أمنياً لاحقاً: Authentication → Users → المستخدم → User Metadata: { "role": "admin" }
 * أو في SQL: UPDATE profiles SET role = 'admin' WHERE id = 'uuid-المستخدم';
 */
const ADMIN_EMAIL_ALLOWLIST = ['byatynwry@gmail.com'];

// ============================================================
// 2. AUTH — تسجيل الدخول والخروج
// ============================================================

const Auth = {

  /** تسجيل مستخدم جديد (يرسل بريد التأكيد إن كان مفعّلاً في المشروع) */
  async register({ email, password, fullName, phone, emailRedirectTo } = {}) {
    const redirect = emailRedirectTo ?? authRedirectUrl();
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirect,
        data: { full_name: fullName, phone }
      }
    });
    if (error) throw error;
    return data;
  },

  /** إعادة إرسال رسالة تأكيد التسجيل (signup) */
  async resendSignupEmail(email, emailRedirectTo) {
    const redirect = emailRedirectTo ?? authRedirectUrl();
    const payload = { type: 'signup', email };
    if (redirect) payload.options = { emailRedirectTo: redirect };
    const { error } = await db.auth.resend(payload);
    if (error) throw error;
  },

  /** تسجيل دخول */
  async login({ email, password }) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  /** تسجيل خروج */
  async logout() {
    const { error } = await db.auth.signOut();
    if (error) throw error;
  },

  /** الحصول على المستخدم الحالي */
  async getCurrentUser() {
    const { data: { user } } = await db.auth.getUser();
    return user;
  },

  /** الاستماع لتغييرات حالة المصادقة */
  onAuthChange(callback) {
    return db.auth.onAuthStateChange((event, session) => {
      callback(event, session?.user ?? null);
    });
  },

  /** إعادة تعيين كلمة المرور */
  async resetPassword(email) {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password'
    });
    if (error) throw error;
  }
};

// ============================================================
// 3. PRODUCTS — جلب المنتجات مع الصور
// ============================================================

const Products = {

  /** دالة مساعدة لمعالجة صورة المنتج */
  normalizeProductImage(product) {
    if (!product) return product;
    return {
      ...product,
      image_url: product.image_url || DEFAULT_PRODUCT_IMAGE
    };
  },

  /** جلب كل المنتجات النشطة */
  async getAll({ categorySlug = null, search = null, limit = 100 } = {}) {
    let categoryId = null;
    if (categorySlug) {
      const { data: cRow } = await db.from('categories').select('id').eq('slug', categorySlug).maybeSingle();
      categoryId = cRow?.id ?? null;
    }

    let query = db
      .from('products')
      .select(`
        *,
        category:categories(slug, name_ar, icon),
        variants:product_variants(*)
      `)
      .eq('is_active', true)
      .order('sort_order');

    if (categoryId) query = query.eq('category_id', categoryId);

    if (search && String(search).trim()) {
      const q = String(search).trim();
      query = query.ilike('name_ar', `%${q}%`);
    }

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    return data.map(p => this.normalizeProductImage(p));
  },

  /** جلب منتج واحد بالـ ID */
  async getById(id) {
    const { data, error } = await db
      .from('products')
      .select(`
        *,
        category:categories(*),
        variants:product_variants(*),
        reviews:product_reviews(rating, comment, created_at,
          user:profiles(full_name))
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single();
    if (error) throw error;
    return this.normalizeProductImage(data);
  },

  /** جلب المنتجات المميزة */
  async getFeatured(limit = 8) {
    const { data, error } = await db
      .from('products')
      .select('*, category:categories(slug,name_ar,icon), variants:product_variants(*)')
      .eq('is_active', true)
      .eq('is_featured', true)
      .limit(limit);
    if (error) throw error;
    return data.map(p => this.normalizeProductImage(p));
  },

  /** تسجيل مشاهدة المنتج (لتحسين الاقتراحات) */
  async logView(productId) {
    const user = await Auth.getCurrentUser();
    await db.from('product_views').insert({
      product_id: productId,
      user_id: user?.id ?? null,
      session_id: sessionStorage.getItem('sid') ?? null
    });
  },

  /** تحميل صورة منتج */
  async uploadProductImage(productId, file) {
    try {
      // إنشاء اسم فريد للملف
      const timestamp = Date.now();
      const fileName = `${productId}-${timestamp}-${file.name}`;
      const filePath = `products/${fileName}`;

      // تحميل الملف إلى Supabase Storage
      const { error: uploadError } = await db.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // الحصول على رابط الصورة العام
      const { data } = db.storage
        .from('product-images')
        .getPublicUrl(filePath);

      if (!data.publicUrl) throw new Error('فشل الحصول على رابط الصورة');

      // تحديث سجل المنتج بالصورة
      const { error: updateError } = await db
        .from('products')
        .update({ image_url: data.publicUrl })
        .eq('id', productId);

      if (updateError) throw updateError;

      return data.publicUrl;
    } catch (error) {
      console.error('خطأ في تحميل الصورة:', error);
      throw error;
    }
  },

  /** حذف صورة منتج */
  async deleteProductImage(productId) {
    try {
      const { error } = await db
        .from('products')
        .update({ image_url: null })
        .eq('id', productId);

      if (error) throw error;
    } catch (error) {
      console.error('خطأ في حذف الصورة:', error);
      throw error;
    }
  }
};

// ============================================================
// 3b. CATEGORIES — الأقسام
// ============================================================

const Categories = {

  /** جلب كل الأقسام (للعرض في المتجر ولوحة التحكم) */
  async list() {
    const { data, error } = await db
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }
};

// ============================================================
// 3c. ADMIN — إدارة المنتجات (يُنفَّذ فقط إن سمحت سياسات RLS للمستخدم admin)
// ============================================================

const Admin = {

  async _assertAdmin() {
    const user = await Auth.getCurrentUser();
    if (!user) throw new Error('يجب تسجيل الدخول كمسؤول');

    const email = (user.email || '').trim().toLowerCase();
    if (email && ADMIN_EMAIL_ALLOWLIST.some((e) => String(e).trim().toLowerCase() === email)) {
      return user;
    }

    const meta = user.user_metadata || {};
    const app = user.app_metadata || {};
    if (meta.role === 'admin' || meta.is_admin === true || app.role === 'admin') return user;

    const { data: prof, error } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      const ignorable = ['PGRST116', '42P01', '42501', 'PGRST301'];
      const msg = (error.message || '').toLowerCase();
      if (!ignorable.includes(error.code) && !msg.includes('permission') && !msg.includes('rls')) {
        console.warn('[Admin] profiles:', error);
      } else {
        console.warn('[Admin] تعذّر التحقق من جدول profiles (صلاحيات RLS أو الجدول غير متاح). استخدم Metadata أو ADMIN_EMAIL_ALLOWLIST.');
      }
    } else if (prof?.role === 'admin') {
      return user;
    }

    throw new Error(
      'صلاحية الإدارة غير مفعّلة. اختر أحد الخيارات: (1) أضف بريدك إلى ADMIN_EMAIL_ALLOWLIST في supabase-api.js ' +
        '(2) في Supabase: Authentication → المستخدم → User Metadata: {"role":"admin"} ' +
        '(3) جدول profiles: عمود role = admin لهذا المستخدم'
    );
  },

  /** كل المنتجات (للإدارة) بما فيها غير النشطة */
  async listAllProducts() {
    await this._assertAdmin();
    const { data, error } = await db
      .from('products')
      .select(`
        *,
        category:categories(*),
        variants:product_variants(*)
      `)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(p => Products.normalizeProductImage(p));
  },

  async getProduct(id) {
    await this._assertAdmin();
    const { data, error } = await db
      .from('products')
      .select(`
        *,
        category:categories(*),
        variants:product_variants(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return Products.normalizeProductImage(data);
  },

  /**
   * إنشاء منتج + أنواعه
   * الحقول: category_id, name_ar, emoji, base_price, unit, image_url (اختياري),
   * is_active, is_featured, sort_order, description (اختياري)
   */
  async createProduct(row, variants = []) {
    await this._assertAdmin();
    const payload = {
      category_id: row.category_id,
      name_ar: row.name_ar,
      emoji: row.emoji || '📦',
      base_price: Number(row.base_price) || 0,
      unit: row.unit || 'قطعة',
      image_url: row.image_url || null,
      is_active: row.is_active !== false,
      is_featured: !!row.is_featured,
      sort_order: Number(row.sort_order) || 0
    };
    if (row.stock_quantity !== undefined && row.stock_quantity !== null && row.stock_quantity !== '') {
      payload.stock_quantity = Math.max(0, parseInt(row.stock_quantity, 10) || 0);
    }

    let { data: product, error } = await db
      .from('products')
      .insert(payload)
      .select()
      .single();
    if (error && payload.stock_quantity !== undefined && String(error.message || '').match(/stock_quantity|column|schema/i)) {
      delete payload.stock_quantity;
      ({ data: product, error } = await db.from('products').insert(payload).select().single());
    }
    if (error) throw error;

    await this._replaceVariants(product.id, variants);
    return this.getProduct(product.id);
  },

  async updateProduct(id, row, variants = null) {
    await this._assertAdmin();
    const payload = {};
    if (row.category_id != null) payload.category_id = row.category_id;
    if (row.name_ar != null) payload.name_ar = row.name_ar;
    if (row.emoji != null) payload.emoji = row.emoji;
    if (row.base_price != null) payload.base_price = Number(row.base_price);
    if (row.unit != null) payload.unit = row.unit;
    if (row.image_url !== undefined) payload.image_url = row.image_url || null;
    if (row.is_active != null) payload.is_active = !!row.is_active;
    if (row.is_featured != null) payload.is_featured = !!row.is_featured;
    if (row.sort_order != null) payload.sort_order = Number(row.sort_order);
    if (row.stock_quantity !== undefined) {
      payload.stock_quantity = Math.max(0, parseInt(row.stock_quantity, 10) || 0);
    }

    let { error } = await db.from('products').update(payload).eq('id', id);
    if (error && payload.stock_quantity !== undefined && String(error.message || '').match(/stock_quantity|column|schema/i)) {
      delete payload.stock_quantity;
      ({ error } = await db.from('products').update(payload).eq('id', id));
    }
    if (error) throw error;

    if (variants && Array.isArray(variants)) await this._replaceVariants(id, variants);
    return this.getProduct(id);
  },

  async setProductActive(id, isActive) {
    await this._assertAdmin();
    const { error } = await db.from('products').update({ is_active: !!isActive }).eq('id', id);
    if (error) throw error;
  },

  async deleteProduct(id, { allowSoftFallback = true } = {}) {
    await this._assertAdmin();
    try {
      const { error: variantsErr } = await db.from('product_variants').delete().eq('product_id', id);
      if (variantsErr) throw variantsErr;
      // Remove dependent order items first to avoid FK violations on products.id.
      const { error: orderItemsErr } = await db.from('order_items').delete().eq('product_id', id);
      if (orderItemsErr) throw orderItemsErr;
      const { error } = await db.from('products').delete().eq('id', id);
      if (error) throw error;
      return { deleted: true, softDeleted: false };
    } catch (e) {
      if (!allowSoftFallback) throw e;
      // Fallback: hide product and try to detach it from category
      // so archived products do not block category deletion.
      let softErr = null;
      {
        const res = await db
          .from('products')
          .update({ is_active: false, category_id: null, updated_at: new Date().toISOString() })
          .eq('id', id);
        softErr = res.error || null;
      }
      if (softErr && String(softErr.message || '').match(/category_id|null|constraint|violat/i)) {
        const res2 = await db
          .from('products')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', id);
        softErr = res2.error || null;
      }
      if (softErr) throw e;
      return { deleted: false, softDeleted: true, reason: e && e.message ? e.message : String(e) };
    }
  },

  async _replaceVariants(productId, variants) {
    await db.from('product_variants').delete().eq('product_id', productId);
    const rows = variants
      .filter(v => v && String(v.name_ar || '').trim())
      .map((v, i) => ({
        product_id: productId,
        name_ar: String(v.name_ar).trim(),
        price_delta: Number(v.price_delta) || 0,
        sort_order: i,
        stock_qty: Math.max(0, parseInt(v.stock_qty, 10) || 0)
      }));
    if (!rows.length) return;
    let { error } = await db.from('product_variants').insert(rows);
    if (error && String(error.message || '').match(/stock_qty|column|schema/i)) {
      const slim = rows.map(({ stock_qty, ...r }) => r);
      ({ error } = await db.from('product_variants').insert(slim));
    }
    if (error) throw error;
  },

  /** إنشاء قسم جديد */
  async createCategory({ slug, name_ar, icon = '📦', sort_order = 0 }) {
    await this._assertAdmin();
    const { data, error } = await db
      .from('categories')
      .insert({ slug, name_ar, icon, sort_order })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** حذف قسم (يرفض إذا كان مرتبطاً بمنتجات) */
  async deleteCategory(categoryId) {
    await this._assertAdmin();
    if (!categoryId) throw new Error('معرّف القسم مطلوب');

    const { count, error: cntErr } = await db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('is_active', true);
    if (cntErr) throw cntErr;
    if ((count || 0) > 0) {
      throw new Error('لا يمكن حذف القسم لأنه يحتوي على منتجات نشطة. احذفها أو اخفها أولاً.');
    }

    const { error } = await db.from('categories').delete().eq('id', categoryId);
    if (error) throw error;
    return true;
  }
};

// ============================================================
// 4. ASSOCIATION RULES — خوارزمية الترابط
// ============================================================

const Recommendations = {

  /**
   * جلب المنتجات المقترحة بناءً على سلة المشتريات
   * @param {string[]} productIds - قائمة IDs المنتجات في السلة
   * @param {number} limit - عدد الاقتراحات
   */
  async getForCart(productIds, limit = 8) {
    if (!productIds.length) return [];

    const { data, error } = await db
      .from('association_rules')
      .select(`
        confidence, lift, support,
        product:related_id(
          id, name_ar, emoji, base_price, unit, image_url,
          variants:product_variants(id, name_ar, price_delta)
        )
      `)
      .in('product_id', productIds)
      .not('related_id', 'in', `(${productIds.join(',')})`)
      .eq('product.is_active', true)
      .order('lift', { ascending: false })
      .limit(limit * 3); // جلب أكثر ثم تجميعها

    if (error) throw error;

    // تجميع الاقتراحات وترتيبها بالـ confidence المجمّع
    const scores = {};
    data.forEach(row => {
      if (!row.product) return;
      const pid = row.product.id;
      if (!scores[pid]) {
        scores[pid] = { product: Products.normalizeProductImage(row.product), score: 0 };
      }
      scores[pid].score += row.confidence * row.lift;
    });

    return Object.values(scores)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.product,
        confidence_pct: Math.round(Math.min(item.score, 1) * 100)
      }));
  },

  /**
   * تحديث قواعد الترابط بعد إتمام طلب (يُستدعى من Admin)
   * في الواقع، هذا يُحسب بـ cron job من البيانات الفعلية
   */
  async upsertRule({ productId, relatedId, confidence, lift, support }) {
    const { error } = await db
      .from('association_rules')
      .upsert({
        product_id: productId,
        related_id: relatedId,
        confidence,
        lift,
        support,
        rule_source: 'computed'
      }, { onConflict: 'product_id,related_id' });
    if (error) throw error;
  }
};

// ============================================================
// 5. CART — سلة التسوق (مزامنة مع الخادم)
// ============================================================

const Cart = {

  _cartId: null,

  /** الحصول على سلة المستخدم أو إنشاء واحدة */
  async getOrCreate() {
    const user = await Auth.getCurrentUser();

    // بحث عن سلة موجودة
    let query = db.from('carts').select('id');
    if (user) query = query.eq('user_id', user.id);
    else       query = query.eq('session_id', this._getSessionId());

    const { data: existing } = await query.maybeSingle();
    if (existing) {
      this._cartId = existing.id;
      return existing.id;
    }

    // إنشاء سلة جديدة
    const { data, error } = await db.from('carts').insert({
      user_id:    user?.id ?? null,
      session_id: user ? null : this._getSessionId()
    }).select('id').single();
    if (error) throw error;
    this._cartId = data.id;
    return data.id;
  },

  /** جلب محتويات السلة */
  async getItems() {
    const cartId = await this.getOrCreate();
    const { data, error } = await db
      .from('cart_items')
      .select(`
        id, quantity, unit_price, added_at,
        product:products(id, name_ar, emoji, base_price, unit, image_url),
        variant:product_variants(id, name_ar, price_delta)
      `)
      .eq('cart_id', cartId)
      .order('added_at', { ascending: false });
    if (error) throw error;
    
    // معالجة الصور
    return data.map(item => ({
      ...item,
      product: Products.normalizeProductImage(item.product)
    }));
  },

  /** إضافة للسلة */
  async addItem({ productId, variantId = null, quantity = 1, unitPrice = 0 }) {
    const cartId = await this.getOrCreate();
    const { error } = await db
      .from('cart_items')
      .upsert({
        cart_id: cartId,
        product_id: productId,
        variant_id: variantId,
        quantity,
        unit_price: unitPrice
      }, { onConflict: 'cart_id,product_id,variant_id',
           ignoreDuplicates: false });
    if (error) throw error;
  },

  /** تحديث الكمية */
  async updateQty(cartItemId, quantity) {
    if (quantity <= 0) return this.removeItem(cartItemId);
    const { error } = await db
      .from('cart_items')
      .update({ quantity })
      .eq('id', cartItemId);
    if (error) throw error;
  },

  /** حذف منتج */
  async removeItem(cartItemId) {
    const { error } = await db
      .from('cart_items')
      .delete()
      .eq('id', cartItemId);
    if (error) throw error;
  },

  /** تفريغ السلة */
  async clear() {
    if (!this._cartId) return;
    const { error } = await db
      .from('cart_items')
      .delete()
      .eq('cart_id', this._cartId);
    if (error) throw error;
  },

  _getSessionId() {
    let sid = sessionStorage.getItem('he_sid');
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem('he_sid', sid);
    }
    return sid;
  }
};

// ============================================================
// 6. ORDERS — الطلبات
// ============================================================

const Orders = {

  /** إنشاء طلب جديد */
  async create({ addressId, paymentMethod = 'cash', promoCode = null, notes = '' }) {
    const user = await Auth.getCurrentUser();
    if (!user) throw new Error('يجب تسجيل الدخول أولاً');

    const items = await Cart.getItems();
    if (!items.length) throw new Error('السلة فارغة');

    // حساب الأسعار
    const subtotal = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
    const deliveryFee = 3000;
    let discount = 0;

    // التحقق من كود الخصم
    if (promoCode) {
      const codeData = await this._validatePromo(promoCode, subtotal, user.id);
      discount = codeData.discount;
    }

    const total = subtotal + deliveryFee - discount;

    // جلب تفاصيل العنوان
    const { data: addr } = await db
      .from('addresses').select('*').eq('id', addressId).single();

    // إنشاء الطلب
    const { data: order, error: orderErr } = await db
      .from('orders')
      .insert({
        user_id:           user.id,
        address_id:        addressId,
        delivery_city:     addr?.city,
        delivery_district: addr?.district,
        delivery_street:   addr?.street,
        delivery_notes:    addr?.notes,
        payment_method:    paymentMethod,
        subtotal,
        delivery_fee:      deliveryFee,
        discount_amount:   discount,
        total,
        notes
      })
      .select('id, order_number')
      .single();
    if (orderErr) throw orderErr;

    // إضافة عناصر الطلب
    const orderItems = items.map(i => ({
      order_id:     order.id,
      product_id:   i.product.id,
      variant_id:   i.variant?.id ?? null,
      product_name: i.product.name_ar,
      variant_name: i.variant?.name_ar ?? null,
      quantity:     i.quantity,
      unit_price:   i.unit_price
    }));

    const { error: itemsErr } = await db.from('order_items').insert(orderItems);
    if (itemsErr) throw itemsErr;

    // تفريغ السلة
    await Cart.clear();

    return order;
  },

  /** جلب طلبات المستخدم */
  async getMyOrders() {
    const user = await Auth.getCurrentUser();
    if (!user) return [];

    const { data, error } = await db
      .from('orders')
      .select(`
        id, order_number, status, total, created_at,
        items:order_items(product_name, variant_name, quantity, unit_price)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  /** الاستماع لتحديثات الطلب في الوقت الفعلي */
  subscribeToOrder(orderId, callback) {
    return db
      .channel(`order-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`
      }, payload => callback(payload.new))
      .subscribe();
  },

  async _validatePromo(code, subtotal, userId) {
    const { data, error } = await db
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();
    if (error || !data) throw new Error('كود الخصم غير صالح');
    if (data.valid_until && new Date(data.valid_until) < new Date())
      throw new Error('انتهت صلاحية الكود');
    if (subtotal < data.min_order_amount)
      throw new Error(`الحد الأدنى للطلب ${data.min_order_amount.toLocaleString()} د.ع`);

    const discount = data.discount_type === 'percent'
      ? subtotal * (data.discount_value / 100)
      : data.discount_value;

    return { discount: Math.min(discount, subtotal) };
  }
};

// ============================================================
// 7. ADDRESSES — العناوين
// ============================================================

const Addresses = {

  async getAll() {
    const { data, error } = await db
      .from('addresses')
      .select('*')
      .order('is_default', { ascending: false });
    if (error) throw error;
    return data;
  },

  async add({ label, city, district, street, buildingNo, floor, notes, lat, lng, isDefault = false }) {
    const user = await Auth.getCurrentUser();
    if (!user) throw new Error('يجب تسجيل الدخول');

    if (isDefault) {
      // إلغاء الافتراضي السابق
      await db.from('addresses')
        .update({ is_default: false })
        .eq('user_id', user.id);
    }

    const { data, error } = await db.from('addresses').insert({
      user_id: user.id, label, city, district,
      street, building_no: buildingNo, floor,
      notes, lat, lng, is_default: isDefault
    }).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await db.from('addresses').delete().eq('id', id);
    if (error) throw error;
  }
};

// ============================================================
// 8. NOTIFICATIONS — الإشعارات
// ============================================================

const Notifications = {

  async getAll() {
    const { data, error } = await db
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },

  async markRead(id) {
    await db.from('notifications').update({ is_read: true }).eq('id', id);
  },

  subscribeToNew(callback) {
    db.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      db.channel('my-notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, payload => callback(payload.new))
        .subscribe();
    });
  }
};

// ============================================================
// 9. EXPORT — تصدير لاستخدامها في الملف الرئيسي
// ============================================================

window.HE = {
  db, Auth, Products, Categories, Admin, Recommendations, Cart, Orders,
  Addresses, Notifications, DEFAULT_PRODUCT_IMAGE
};

/*
 * ──────────────────────────────────────────────
 * مثال الاستخدام في ملف الموقع (index.html):
 * ──────────────────────────────────────────────
 *
 * // تسجيل دخول
 * await HE.Auth.login({ email: 'user@example.com', password: '...' });
 *
 * // جلب منتجات قسم عطور نسائية (مع الصور)
 * const perfumes = await HE.Products.getAll({ categorySlug: 'women' });
 * console.log(perfumes[0].image_url); // رابط الصورة
 *
 * // إضافة للسلة
 * await HE.Cart.addItem({ productId: '...', quantity: 2, unitPrice: 4500 });
 *
 * // جلب اقتراحات خوارزمية الترابط
 * const cartIds = (await HE.Cart.getItems()).map(i => i.product.id);
 * const recs = await HE.Recommendations.getForCart(cartIds);
 *
 * // تحميل صورة منتج
 * const imageUrl = await HE.Products.uploadProductImage(productId, imageFile);
 *
 * // إتمام الطلب
 * const order = await HE.Orders.create({ addressId: '...', paymentMethod: 'cash' });
 *
 */
